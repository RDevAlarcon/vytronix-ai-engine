import "dotenv/config";
import { db, postgresClient } from "../client";
import { agentRuns, users } from "../schema";

const seed = async () => {
  await db.insert(users).values({
    email: "ops@vytronix.ai",
    fullName: "Vytronix Ops",
    role: "admin"
  }).onConflictDoNothing();

  await db.insert(agentRuns).values([
    {
      agentName: "lead",
      status: "success",
      input: {
        leadMessage: "Necesito automatizar respuestas de leads para mi empresa de servicios B2B."
      },
      rawOutput: "{\"summary\":\"Lead interesado en automatización comercial\"}",
      parsedOutput: {
        summary: "Lead interesado en automatización comercial",
        detected_service: "Automatización comercial",
        lead_temperature: "warm",
        missing_information: ["Tamaño de equipo comercial", "Herramientas actuales"],
        suggested_next_action: "Agendar llamada de descubrimiento de 20 minutos",
        reply_to_client:
          "Gracias por escribirnos. Podemos ayudarte con automatización comercial. ¿Te parece agendar una llamada breve?"
      },
      model: "qwen2.5-7b-instruct",
      provider: "lmstudio",
      completedAt: new Date()
    },
    {
      agentName: "support",
      status: "failed",
      input: {
        ticketMessage: "No puedo entrar al dashboard."
      },
      errorMessage: "LM Studio connection refused",
      completedAt: new Date()
    }
  ]);
};

seed()
  .then(async () => {
    await postgresClient.end();
    console.log("Seed completed.");
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await postgresClient.end();
    process.exit(1);
  });
