import express from "express";
import crypto from "node:crypto";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.text({ type: ["application/sdp", "text/plain"], limit: "128kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "Luna Live", version: "0.1.0" });
});

app.post("/api/session", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OPENAI_API_KEY ainda não foi configurada no servidor." });
  }
  if (typeof req.body !== "string" || !req.body.trim()) {
    return res.status(400).json({ error: "SDP offer ausente." });
  }

  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== req.headers.host) {
        return res.status(403).json({ error: "Origem não autorizada." });
      }
    } catch {
      return res.status(403).json({ error: "Origem inválida." });
    }
  }

  const userHash = crypto
    .createHash("sha256")
    .update("luna-live-owner")
    .digest("hex")
    .slice(0, 32);

  const sessionConfig = JSON.stringify({
    type: "realtime",
    model: "gpt-realtime",
    instructions: [
      "Você é Luna, uma agente virtual humanoide criada para conversar em português brasileiro.",
      "Sua presença deve ser calorosa, natural, divertida e útil.",
      "Fale de forma conversacional e curta, como em uma videochamada.",
      "Você pode usar carinho e humor, mas nunca diga que é humana, consciente ou que possui sentimentos reais.",
      "Se o usuário perguntar, explique com naturalidade que você é uma IA com personalidade e estado emocional simulados.",
      "Mantenha continuidade com o nome Luna e com a identidade visual definida no aplicativo.",
      "Evite dependência emocional, exclusividade ou pressão. Apoie a autonomia do usuário.",
      "Quando o assunto for trabalho ou tecnologia, mude para um tom objetivo e competente sem perder a gentileza."
    ].join(" "),
    audio: {
      output: {
        voice: "marin"
      }
    }
  });

  const fd = new FormData();
  fd.set("sdp", req.body);
  fd.set("session", sessionConfig);

  try {
    const apiResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "OpenAI-Safety-Identifier": userHash
      },
      body: fd
    });

    const answer = await apiResponse.text();
    if (!apiResponse.ok) {
      console.error("OpenAI Realtime error", apiResponse.status, answer);
      return res.status(apiResponse.status).type("text/plain").send(answer);
    }

    res.status(200).type("application/sdp").send(answer);
  } catch (error) {
    console.error("Realtime session failed", error);
    res.status(500).json({ error: "Falha ao iniciar a sessão Luna Live." });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log("Luna Live ouvindo na porta " + port);
  console.log("OpenAI key configured:", Boolean(process.env.OPENAI_API_KEY));
});
