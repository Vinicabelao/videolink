import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import ytdlp from "youtube-dl-exec";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const DOWNLOAD_DIR = path.join(__dirname, "downloads");
const STATS_FILE = path.join(__dirname, "stats.json");

await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

async function getDownloads() {
  try {
    const data = await fs.readFile(STATS_FILE, "utf8");
    return JSON.parse(data).downloads || 0;
  } catch {
    await fs.writeFile(
      STATS_FILE,
      JSON.stringify({ downloads: 0 }, null, 2)
    );
    return 0;
  }
}

async function incrementDownloads() {
  const downloads = (await getDownloads()) + 1;

  await fs.writeFile(
    STATS_FILE,
    JSON.stringify({ downloads }, null, 2)
  );

  return downloads;
}

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);

app.use(morgan("tiny"));
app.use(express.json({ limit: "32kb" }));

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

function validUrl(value) {
  try {
    const u = new URL(value);

    return ["http:", "https:"].includes(u.protocol);
  } catch {
    return false;
  }
}

function supported(value) {
  try {
    const host = new URL(value)
      .hostname
      .toLowerCase()
      .replace(/^www\./, "");

    return (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtu.be" ||
      host === "tiktok.com" ||
      host.endsWith(".tiktok.com")
    );
  } catch {
    return false;
  }
}

const jobs = new Map();

// ========================================
// CONVERTER VÍDEO
// ========================================

app.post("/api/convert", async (req, res) => {
  const url = String(req.body?.url || "").trim();

  if (!validUrl(url)) {
    return res.status(400).json({
      error: "Cole uma URL válida."
    });
  }

  if (!supported(url)) {
    return res.status(400).json({
      error: "Use um link do YouTube ou TikTok."
    });
  }

  const id = randomUUID();

  const jobDir = path.join(
    DOWNLOAD_DIR,
    id
  );

  await fs.mkdir(jobDir, {
    recursive: true
  });

  const output = path.join(
    jobDir,
    "video.%(ext)s"
  );

  const finalFile = path.join(
    jobDir,
    "video.mp4"
  );

  jobs.set(id, {
    status: "processing"
  });

  res.json({ id });

  try {
    await ytdlp(url, {
      output,

      // MP4
      format:
        "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",

      mergeOutputFormat: "mp4",

      noPlaylist: true,

      restrictFilenames: true,

      noWarnings: true,

      quiet: true,

      // Runtime JavaScript para desafios do YouTube
      jsRuntimes: "deno",

      // Scripts EJS oficiais
      remoteComponents: "ejs:npm"
    });

    const stat = await fs
      .stat(finalFile)
      .catch(() => null);

    if (!stat) {
      throw new Error(
        "O arquivo MP4 não foi criado."
      );
    }

    jobs.set(id, {
      status: "done",
      file: finalFile
    });

    console.log(
      `Vídeo convertido com sucesso: ${id}`
    );

  } catch (err) {
    console.error(
      "ERRO NO YT-DLP:",
      err?.stderr ||
      err?.message ||
      err
    );

    jobs.set(id, {
      status: "error",
      message:
        "Não foi possível processar esse vídeo."
    });

    try {
      await fs.rm(jobDir, {
        recursive: true,
        force: true
      });
    } catch {}
  }
});

// ========================================
// STATUS DA CONVERSÃO
// ========================================

app.get(
  "/api/status/:id",
  async (req, res) => {
    const job = jobs.get(req.params.id);

    if (!job) {
      return res.status(404).json({
        error: "Conversão não encontrada."
      });
    }

    if (job.status === "done") {
      const stat = await fs
        .stat(job.file)
        .catch(() => null);

      if (!stat) {
        jobs.delete(req.params.id);

        return res.status(500).json({
          error: "Arquivo não encontrado."
        });
      }

      return res.json({
        status: "done",
        download:
          `/api/download/${req.params.id}`,
        size: stat.size
      });
    }

    return res.json(job);
  }
);

// ========================================
// CONTADOR DE DOWNLOADS
// ========================================

app.get(
  "/api/stats",
  async (req, res) => {
    res.json({
      downloads: await getDownloads()
    });
  }
);

// ========================================
// DOWNLOAD
// ========================================

app.get(
  "/api/download/:id",
  async (req, res) => {
    const job = jobs.get(req.params.id);

    if (
      !job ||
      job.status !== "done"
    ) {
      return res
        .status(404)
        .send(
          "Arquivo ainda não está pronto."
        );
    }

    res.download(
      job.file,
      "video.mp4",
      async (err) => {
        if (!err) {
          await incrementDownloads();
        }

        try {
          await fs.rm(
            path.dirname(job.file),
            {
              recursive: true,
              force: true
            }
          );
        } catch {}

        jobs.delete(req.params.id);
      }
    );
  }
);

// ========================================
// PÁGINA PRINCIPAL
// ========================================

app.get(
  "*splat",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(
  PORT,
  () => {
    console.log(
      `VideoLink rodando em http://localhost:${PORT}`
    );
  }
);