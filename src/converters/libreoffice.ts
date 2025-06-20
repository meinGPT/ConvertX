import path from "node:path";
import { $ } from "bun";

export const properties = {
  from: {
    document: ["doc", "docx", "odt", "rtf", "txt", "html", "xml"],
    spreadsheet: ["xls", "xlsx", "ods", "csv", "tsv"],
    presentation: ["ppt", "pptx", "odp"],
  },
  to: {
    document: ["pdf", "docx", "odt", "rtf", "txt", "html"],
    spreadsheet: ["pdf", "xlsx", "ods", "csv", "html"],
    presentation: ["pdf", "pptx", "odp", "html"],
  },
};

export async function convert(
  inputPath: string,
  inputFormat: string,
  outputFormat: string,
  outputPath: string,
): Promise<string> {
  const outputDir = path.dirname(outputPath);
  const inputBasename = path.basename(inputPath, path.extname(inputPath));
  
  console.log(`[LibreOffice] Converting ${inputPath} from ${inputFormat} to ${outputFormat}`);
  console.log(`[LibreOffice] Output directory: ${outputDir}`);
  
  try {
    // LibreOffice headless conversion command
    const command = `soffice --headless --convert-to ${outputFormat} --outdir ${outputDir} ${inputPath}`;
    console.log(`[LibreOffice] Running command: ${command}`);
    
    const result = await $`soffice --headless --convert-to ${outputFormat} --outdir ${outputDir} ${inputPath}`;
    
    if (result.stderr.length > 0) {
      console.error(`[LibreOffice] stderr:`, result.stderr.toString());
    }
    if (result.stdout.length > 0) {
      console.log(`[LibreOffice] stdout:`, result.stdout.toString());
    }
    
    // LibreOffice generates files with its own naming convention
    // We need to rename it to match the expected output path
    const generatedFile = path.join(outputDir, `${inputBasename}.${outputFormat}`);
    console.log(`[LibreOffice] Looking for generated file: ${generatedFile}`);
    
    // Check if the generated file exists and rename it
    const file = Bun.file(generatedFile);
    if (await file.exists()) {
      console.log(`[LibreOffice] Found generated file, renaming to: ${outputPath}`);
      // Rename to the expected output path
      await $`mv ${generatedFile} ${outputPath}`;
      console.log(`[LibreOffice] Conversion successful`);
      return "Done";
    } else {
      // List files in output directory to debug
      const dirContents = await $`ls -la ${outputDir}`;
      console.error(`[LibreOffice] Directory contents:`, dirContents.stdout.toString());
      throw new Error(`LibreOffice did not generate expected output file: ${generatedFile}`);
    }
  } catch (error) {
    console.error("[LibreOffice] Conversion error:", error);
    if (error instanceof Error) {
      console.error("[LibreOffice] Error message:", error.message);
      console.error("[LibreOffice] Error stack:", error.stack);
    }
    throw new Error(`LibreOffice conversion failed: ${error}`);
  }
}