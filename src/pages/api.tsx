import { mkdir } from "node:fs/promises";
import { Elysia, t } from "elysia";
import sanitize from "sanitize-filename";
import { outputDir, uploadsDir } from "..";
import { getAllInputs, getAllTargets, getPossibleTargets, mainConverter } from "../converters/main";
import db from "../db/db";
import { Jobs, User } from "../db/types";
import { normalizeFiletype, normalizeOutputFiletype } from "../helpers/normalizeFiletype";
import { userService } from "./user";

// Middleware to handle both Basic Auth and JWT authentication
async function authenticateUser({ jwt, cookie: { auth }, headers, set }: any) {
  // First try JWT cookie auth
  if (auth?.value) {
    const jwtUser = await jwt.verify(auth.value);
    if (jwtUser) {
      return { id: jwtUser.id };
    }
  }

  // Then try Basic Auth
  const authHeader = headers.authorization;
  if (authHeader && authHeader.startsWith("Basic ")) {
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, "base64").toString("utf8");
    const [email, password] = credentials.split(":");

    if (email && password) {
      const user = db.query("SELECT * FROM users WHERE email = ?").as(User).get(email);
      if (user) {
        const validPassword = await Bun.password.verify(password, user.password);
        if (validPassword) {
          return { id: String(user.id) };
        }
      }
    }
  }

  // No valid auth found
  set.status = 401;
  set.headers["WWW-Authenticate"] = 'Basic realm="ConvertX API"';
  return null;
}

export const api = new Elysia({ prefix: "/api" })
  .use(userService)
  // Add error handling
  .onError(({ code, error, set, request }) => {
    console.error(`[API Error] ${request.method} ${request.url}:`, {
      code,
      message: error.message,
      stack: error.stack,
    });
    
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Endpoint not found", path: new URL(request.url).pathname };
    }
    
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "Invalid request", message: error.message };
    }
    
    set.status = 500;
    return { error: "Internal server error", message: error.message };
  })
  .get("/test", () => {
    return { message: "API is working!" };
  })
  .get("/formats", async ({ jwt, cookie: { auth }, headers, set }) => {
    const user = await authenticateUser({ jwt, cookie: { auth }, headers, set });
    if (!user) {
      return { error: "Unauthorized" };
    }

    const allInputs: Record<string, string[]> = {};
    const allOutputs: Record<string, string[]> = {};
    const converterMappings: Record<string, { inputs: string[]; outputs: string[] }> = {};

    // Get all converters and their supported formats
    const allTargets = getAllTargets();

    for (const [converterName, targets] of Object.entries(allTargets)) {
      const inputs = getAllInputs(converterName);

      converterMappings[converterName] = {
        inputs,
        outputs: targets,
      };

      // Build flat lists of all supported formats
      for (const input of inputs) {
        if (!allInputs[input]) {
          allInputs[input] = [];
        }
        if (!allInputs[input].includes(converterName)) {
          allInputs[input].push(converterName);
        }
      }

      for (const output of targets) {
        if (!allOutputs[output]) {
          allOutputs[output] = [];
        }
        if (!allOutputs[output].includes(converterName)) {
          allOutputs[output].push(converterName);
        }
      }
    }

    return {
      converters: converterMappings,
      supportedInputs: Object.keys(allInputs).sort(),
      supportedOutputs: Object.keys(allOutputs).sort(),
      inputsByConverter: allInputs,
      outputsByConverter: allOutputs,
    };
  })
  .get("/formats/:from", async ({ jwt, cookie: { auth }, headers, set, params: { from } }) => {
    const user = await authenticateUser({ jwt, cookie: { auth }, headers, set });
    if (!user) {
      return { error: "Unauthorized" };
    }

    const possibleTargets = getPossibleTargets(from);

    if (Object.keys(possibleTargets).length === 0) {
      set.status = 404;
      return { error: `No converters support the format: ${from}` };
    }

    const flatTargets: string[] = [];
    const converterTargets: Record<string, string[]> = {};

    for (const [converter, targets] of Object.entries(possibleTargets)) {
      converterTargets[converter] = targets;
      for (const target of targets) {
        if (!flatTargets.includes(target)) {
          flatTargets.push(target);
        }
      }
    }

    return {
      from,
      availableTargets: flatTargets.sort(),
      converterTargets,
    };
  })
  .post(
    "/convert",
    async ({ body, jwt, cookie: { auth }, headers, set, request }) => {
      console.log(`[API Convert] Request from ${request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'}`);
      
      const user = await authenticateUser({ jwt, cookie: { auth }, headers, set });
      if (!user) {
        console.log("[API Convert] Authentication failed");
        return { error: "Unauthorized" };
      }

      const { files, convertTo, converterName } = body;
      console.log(`[API Convert] User ${user.id} converting ${files.length} files to ${convertTo}${converterName ? ` using ${converterName}` : ''}`);
      
      // Automatically determine base URL from request
      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      if (!files || !Array.isArray(files) || files.length === 0) {
        set.status = 400;
        return { error: "No files provided" };
      }

      if (!convertTo) {
        set.status = 400;
        return { error: "No target format specified" };
      }

      // Create a new job
      const now = new Date().toISOString();
      const userId = parseInt(user.id);

      console.log("[API Convert] Creating job for user", userId);

      try {
        db.query(
          "INSERT INTO jobs (user_id, status, num_files, date_created) VALUES (?1, ?2, ?3, ?4)",
        ).run(userId, "pending", files.length, now);
      } catch (error) {
        console.error("[API Convert] Database error creating job:", error);
        set.status = 500;
        return { error: "Failed to create job: " + error };
      }
      
      // Get the last inserted row ID
      const jobId = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
      const jobIdValue = jobId.id;
      console.log(`[API Convert] Created job ${jobIdValue} for user ${userId}`);

      const userUploadsDir = `${uploadsDir}${parseInt(user.id)}/${jobIdValue}/`;
      const userOutputDir = `${outputDir}${parseInt(user.id)}/${jobIdValue}/`;

      try {
        await mkdir(userUploadsDir, { recursive: true });
        await mkdir(userOutputDir, { recursive: true });
      } catch (error) {
        console.error(`Failed to create directories for job ${jobIdValue}:`, error);
        set.status = 500;
        return { error: "Failed to create job directories" };
      }

      const results: Array<{
        fileName: string;
        status: string;
        outputFileName?: string;
        downloadUrl?: string;
        error?: string;
      }> = [];

      const normalizedConvertTo = normalizeFiletype(convertTo);
      const query = db.query(
        "INSERT INTO file_names (job_id, file_name, output_file_name, status) VALUES (?1, ?2, ?3, ?4)",
      );

      // Process files sequentially for better error handling
      for (const file of files) {
        const fileName = sanitize(file.name);
        console.log(`[API Convert] Processing file: ${file.name}`);

        if (!fileName) {
          const error = "Invalid file name";
          console.error(`[API Convert] Invalid filename: ${file.name}`);
          results.push({ fileName: file.name, status: "error", error });
          try {
            query.run(jobIdValue, file.name, "", error);
          } catch (e) {
            console.error("[API Convert] Database error inserting failed file:", e);
            throw e;
          }
          continue;
        }

        try {
          let filePath = `${userUploadsDir}${fileName}`;
          
          // Handle URL or base64 content
          if (file.url) {
            console.log(`[API Convert] Downloading file from URL: ${file.url}`);
            const response = await fetch(file.url);
            if (!response.ok) {
              throw new Error(`Failed to download file: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            await Bun.write(filePath, arrayBuffer);
            console.log(`[API Convert] Downloaded ${arrayBuffer.byteLength} bytes`);
          } else if (file.content) {
            console.log(`[API Convert] Processing base64 content`);
            const buffer = Buffer.from(file.content, "base64");
            await Bun.write(filePath, buffer);
            console.log(`[API Convert] Decoded ${buffer.length} bytes`);
          } else {
            throw new Error("No file content or URL provided");
          }

          const fileTypeOrig = fileName.split(".").pop() ?? "";
          const fileType = normalizeFiletype(fileTypeOrig);
          const newFileExt = normalizeOutputFiletype(normalizedConvertTo);
          const newFileName = fileName.replace(
            new RegExp(`${fileTypeOrig}(?!.*${fileTypeOrig})`),
            newFileExt,
          );
          const targetPath = `${userOutputDir}${newFileName}`;

          console.log(`[API Convert] Converting ${fileName} from ${fileType} to ${normalizedConvertTo}`);
          const conversionResult = await mainConverter(
            filePath,
            fileType,
            normalizedConvertTo,
            targetPath,
            {},
            converterName,
          );

          if (conversionResult === "Done") {
            console.log(`[API Convert] Successfully converted ${fileName}`);
            // Use the new download endpoint that doesn't expose user ID
            const downloadUrl = `${baseUrl}/api/job/${jobIdValue}/download/${newFileName}`;
            results.push({
              fileName,
              status: "completed",
              outputFileName: newFileName,
              downloadUrl,
            });
            query.run(jobIdValue, fileName, newFileName, "Done");
          } else {
            console.error(`[API Convert] Conversion failed for ${fileName}:`, conversionResult);
            results.push({
              fileName,
              status: "error",
              error: conversionResult,
            });
            query.run(jobIdValue, fileName, newFileName, conversionResult);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error(`[API Convert] Error processing ${fileName}:`, error);
          results.push({ fileName, status: "error", error: errorMessage });
          query.run(jobIdValue, fileName, "", errorMessage);
        }
      }

      // Update job status
      const completedFiles = results.filter((r) => r.status === "completed").length;
      const jobStatus = completedFiles === files.length ? "completed" : "partial";

      db.query("UPDATE jobs SET status = ? WHERE id = ?").run(jobStatus, jobIdValue);
      
      console.log(`[API Convert] Job ${jobIdValue} completed with status: ${jobStatus} (${completedFiles}/${files.length} files)`);

      return {
        jobId: jobIdValue,
        status: jobStatus,
        totalFiles: files.length,
        completedFiles,
        results,
      };
    },
    {
      body: t.Object({
        files: t.Array(
          t.Object({
            name: t.String(),
            content: t.Optional(t.String()), // base64 encoded file content
            url: t.Optional(t.String()), // URL to download file from
          }),
        ),
        convertTo: t.String(),
        converterName: t.Optional(t.String()),
      }),
    },
  )
  .get("/job/:jobId", async ({ jwt, cookie: { auth }, headers, set, params: { jobId } }) => {
    const user = await authenticateUser({ jwt, cookie: { auth }, headers, set });
    if (!user) {
      return { error: "Unauthorized" };
    }

    const job = db
      .query("SELECT * FROM jobs WHERE id = ? AND user_id = ?")
      .as(Jobs)
      .get(jobId, parseInt(user.id));

    if (!job) {
      set.status = 404;
      return { error: "Job not found" };
    }

    const files = db.query("SELECT * FROM file_names WHERE job_id = ?").all(jobId);

    return {
      job,
      files,
    };
  })
  .get("/download/:userId/:jobId/:fileName", async ({ jwt, cookie: { auth }, headers, set, params }) => {
    const { userId, jobId, fileName } = params;
    console.log(`[API Download] Request for file: user=${userId}, job=${jobId}, file=${fileName}`);
    
    const user = await authenticateUser({ jwt, cookie: { auth }, headers, set });
    if (!user) {
      console.log("[API Download] Authentication failed");
      return { error: "Unauthorized" };
    }
    
    // Verify user has access to this file
    if (parseInt(user.id) !== parseInt(userId)) {
      console.error(`[API Download] Access denied: user ${user.id} tried to access files of user ${userId}`);
      set.status = 403;
      return { error: "Access denied" };
    }

    // Verify job belongs to user
    const job = db
      .query("SELECT * FROM jobs WHERE id = ? AND user_id = ?")
      .as(Jobs)
      .get(jobId, parseInt(userId));

    if (!job) {
      console.error(`[API Download] Job ${jobId} not found for user ${userId}`);
      set.status = 404;
      return { error: "Job not found" };
    }

    // Verify file exists in job
    const fileRecord = db
      .query("SELECT * FROM file_names WHERE job_id = ? AND output_file_name = ?")
      .get(jobId, fileName);

    if (!fileRecord) {
      console.error(`[API Download] File ${fileName} not found in job ${jobId}`);
      set.status = 404;
      return { error: "File not found" };
    }

    const filePath = `${outputDir}${parseInt(userId)}/${jobId}/${fileName}`;
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      console.error(`[API Download] File not found on disk: ${filePath}`);
      set.status = 404;
      return { error: "File not found on disk" };
    }

    // Set appropriate headers for file download
    set.headers["Content-Type"] = file.type || "application/octet-stream";
    set.headers["Content-Disposition"] = `attachment; filename="${fileName}"`;

    console.log(`[API Download] Serving file: ${filePath} (${file.size} bytes)`);
    return file;
  })
  // Alternative download endpoint that doesn't expose user ID
  .get("/job/:jobId/download/:fileName", async ({ jwt, cookie: { auth }, headers, set, params }) => {
    const { jobId, fileName } = params;
    console.log(`[API Download] Request for file via job endpoint: job=${jobId}, file=${fileName}`);
    
    const user = await authenticateUser({ jwt, cookie: { auth }, headers, set });
    if (!user) {
      console.log("[API Download] Authentication failed");
      return { error: "Unauthorized" };
    }
    
    // Verify job belongs to authenticated user
    const job = db
      .query("SELECT * FROM jobs WHERE id = ? AND user_id = ?")
      .as(Jobs)
      .get(jobId, parseInt(user.id));

    if (!job) {
      console.error(`[API Download] Job ${jobId} not found or not owned by user ${user.id}`);
      set.status = 404;
      return { error: "Job not found or access denied" };
    }

    // Verify file exists in job
    const fileRecord = db
      .query("SELECT * FROM file_names WHERE job_id = ? AND output_file_name = ?")
      .get(jobId, fileName);

    if (!fileRecord) {
      console.error(`[API Download] File ${fileName} not found in job ${jobId}`);
      set.status = 404;
      return { error: "File not found" };
    }

    const filePath = `${outputDir}${parseInt(user.id)}/${jobId}/${fileName}`;
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      console.error(`[API Download] File not found on disk: ${filePath}`);
      set.status = 404;
      return { error: "File not found on disk" };
    }

    // Set appropriate headers for file download
    set.headers["Content-Type"] = file.type || "application/octet-stream";
    set.headers["Content-Disposition"] = `attachment; filename="${fileName}"`;

    console.log(`[API Download] Serving file: ${filePath} (${file.size} bytes)`);
    return file;
  })
  // Catch-all for unmatched API routes
  .all("/*", ({ request, set }) => {
    console.error(`[API] Unmatched route: ${request.method} ${request.url}`);
    set.status = 404;
    return { 
      error: "API endpoint not found", 
      method: request.method,
      path: new URL(request.url).pathname,
      availableEndpoints: [
        "GET /api/formats",
        "GET /api/formats/:from", 
        "POST /api/convert",
        "GET /api/job/:jobId",
        "GET /api/download/:userId/:jobId/:fileName",
        "GET /api/job/:jobId/download/:fileName"
      ]
    };
  });
