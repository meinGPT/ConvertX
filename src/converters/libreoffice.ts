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
  
  try {
    // LibreOffice headless conversion command
    await $`soffice --headless --convert-to ${outputFormat} --outdir ${outputDir} ${inputPath}`;
    
    // LibreOffice generates files with its own naming convention
    // We need to rename it to match the expected output path
    const generatedFile = path.join(outputDir, `${inputBasename}.${outputFormat}`);
    
    // Check if the generated file exists and rename it
    const file = Bun.file(generatedFile);
    if (await file.exists()) {
      // Rename to the expected output path
      await $`mv ${generatedFile} ${outputPath}`;
      return "Done";
    } else {
      throw new Error(`LibreOffice did not generate expected output file: ${generatedFile}`);
    }
  } catch (error) {
    console.error("LibreOffice conversion error:", error);
    throw new Error(`LibreOffice conversion failed: ${error}`);
  }
}