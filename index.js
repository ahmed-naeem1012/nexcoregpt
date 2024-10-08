
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const cors = require("cors");

const fsPromises = require("fs").promises;
const readline = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout,
});

const app = express();
app.use(cors());
const port = process.env.PORT || 8880;

// Create an OpenAI connection
const secretKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: secretKey,
});

async function askQuestion(question) {
  return new Promise((resolve, reject) => {
    readline.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function createAssistant() {
  try {
    // Try to get the assistant ID from an environment variable
    let assistantId = process.env.ASSISTANT_ID;

    if (!assistantId) {
      console.log("No existing assistant detected, creating new.\n");
      const assistantConfig = {
        name: "Murder mystery helper",
        instructions:
          "You're a murder mystery assistant, helping solve murder mysteries.",
        tools: [{ type: "retrieval" }],
        model: "gpt-4-1106-preview",
      };

      const assistant = await openai.beta.assistants.create(assistantConfig);
      assistantId = assistant.id;

      // You should set the new assistant ID in your environment variables
      // Note: This won't work on a read-only file system, just a placeholder
      process.env.ASSISTANT_ID = assistantId;
    }

    return assistantId;
  } catch (error) {
    console.error(error);
    throw new Error("Error creating assistant");
  }
}

app.use(bodyParser.json());

app.post("/ask", async (req, res) => {
  try {
    const userQuestion = req.body.question;

    // Create a thread using the assistantId
    const assistantId = await createAssistant();
    const thread = await openai.beta.threads.create();

    const response = await processUserQuestion(
      thread,
      assistantId,
      userQuestion
    );

    res.json({ response });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Servrr Error" });
  }
});

app.post("/submitName", (req, res) => {
  try {
    // Extracting the name from the request body
    const userName = req.body.name;

    if (!userName) {
      // If no name is provided in the request
      return res.status(400).json({ error: "Name is requiredd" });
    }

    // Returning the user's name in a JSON object
    res.json({
      name: userName,
      key: process.env.OPENAI_API_KEY,
      assistantkey: process.env.ASSISTANT_ID,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

async function processUserQuestion(thread, assistantId, userQuestion) {
  // Pass in the user question into the existing thread
  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: userQuestion,
  });

  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: assistantId,
  });

  // Wait for the completion of the run
  await waitForRunCompletion(thread.id, run.id);

  const messages = await openai.beta.threads.messages.list(thread.id);

  // Find the last message for the current run
  const lastMessageForRun = messages.data
    .filter(
      (message) => message.run_id === run.id && message.role === "assistant"
    )
    .pop();

  return lastMessageForRun ? lastMessageForRun.content[0].text.value : null;
}

async function waitForRunCompletion(threadId, runId) {
  let runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);

  while (runStatus.status !== "completed") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);

    if (["failed", "cancelled", "expired"].includes(runStatus.status)) {
      console.log(
        `Run status is '${runStatus.status}'. Unable to complete the request.`
      );
      break;
    }
  }
}
app.get("/", (request, res) => {
  res.set("Content-Type", "text/html");
  res.send(Buffer.from("<h2>Hello , Chat API</h2>"));
});
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
