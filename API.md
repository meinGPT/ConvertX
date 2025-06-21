# ConvertX API Documentation

The ConvertX API provides programmatic access to file conversion capabilities. All endpoints require authentication via JWT tokens.

## Authentication

The API supports two authentication methods:

### 1. Basic Authentication (Recommended for API usage)
Use your ConvertX email and password with standard HTTP Basic Authentication:
```bash
curl -u "email@example.com:password" http://localhost:3000/api/formats
```

### 2. Cookie Authentication (JWT)
All API endpoints also accept a valid JWT token in the `auth` cookie. You must first log in through the web interface to obtain this token.

## Endpoints

### GET /api/formats

Get all supported conversion formats and converters.

**Response:**
```json
{
  "converters": {
    "ffmpeg": {
      "inputs": ["mp4", "avi", "mov", ...],
      "outputs": ["mp4", "avi", "webm", ...]
    },
    "imagemagick": {
      "inputs": ["jpg", "png", "gif", ...],
      "outputs": ["jpg", "png", "webp", ...]
    },
    "libreoffice": {
      "inputs": ["doc", "docx", "odt", "rtf", "txt", "html", "xml", "xls", "xlsx", "ods", "csv", "tsv", "ppt", "pptx", "odp"],
      "outputs": ["pdf", "docx", "odt", "rtf", "txt", "html", "xlsx", "ods", "csv", "pptx", "odp"]
    },
    ...
  },
  "supportedInputs": ["jpg", "png", "mp4", "pdf", ...],
  "supportedOutputs": ["jpg", "png", "mp4", "pdf", ...],
  "inputsByConverter": {
    "jpg": ["imagemagick", "vips"],
    "png": ["imagemagick", "vips"],
    ...
  },
  "outputsByConverter": {
    "jpg": ["imagemagick", "vips"],
    "png": ["imagemagick", "vips"],
    ...
  }
}
```

### GET /api/formats/:from

Get available conversion targets for a specific input format.

**Parameters:**
- `from` - Input file format (e.g., "jpg", "mp4", "pdf")

**Response:**
```json
{
  "from": "jpg",
  "availableTargets": ["png", "webp", "pdf", "gif"],
  "converterTargets": {
    "imagemagick": ["png", "webp", "pdf", "gif"],
    "vips": ["png", "webp"]
  }
}
```

**Example Response for Office Document:**
```json
{
  "from": "docx",
  "availableTargets": ["pdf", "odt", "rtf", "txt", "html"],
  "converterTargets": {
    "libreoffice": ["pdf", "odt", "rtf", "txt", "html"],
    "pandoc": ["pdf", "html", "rtf", "txt"]
  }
}
```

**Error Response (404):**
```json
{
  "error": "No converters support the format: xyz"
}
```

### POST /api/convert

Convert files to a target format. Files can be provided either as base64-encoded content or URLs.

**Request Body:**
```json
{
  "files": [
    {
      "name": "example.jpg",
      "content": "base64-encoded-file-content" // Option 1: base64 content
    },
    {
      "name": "document.pdf", 
      "url": "https://example.com/document.pdf" // Option 2: URL to download
    }
  ],
  "convertTo": "png",
  "converterName": "imagemagick" // optional - specify converter to use
}
```

**Response:**
```json
{
  "jobId": 123,
  "status": "completed", // or "partial"
  "totalFiles": 2,
  "completedFiles": 2,
  "results": [
    {
      "fileName": "example.jpg",
      "status": "completed",
      "outputFileName": "example.png",
      "downloadUrl": "https://api.example.com/api/job/123/download/example.png"
    },
    {
      "fileName": "document.pdf",
      "status": "completed", 
      "outputFileName": "document.png",
      "downloadUrl": "https://api.example.com/api/job/123/download/document.png"
    }
  ]
}
```

Note: Download URLs are automatically generated based on the server's URL.

**Error Response (400):**
```json
{
  "error": "No files provided"
}
```

### GET /api/job/:jobId

Get status and details of a conversion job.

**Parameters:**
- `jobId` - ID of the conversion job

**Response:**
```json
{
  "job": {
    "id": 123,
    "user_id": 1,
    "status": "completed",
    "num_files": 1,
    "date_created": "2024-01-01T12:00:00.000Z"
  },
  "files": [
    {
      "id": 1,
      "job_id": 123,
      "file_name": "example.jpg",
      "output_file_name": "example.png",
      "status": "Done"
    }
  ]
}
```

**Error Response (404):**
```json
{
  "error": "Job not found"
}
```

### GET /api/download/:userId/:jobId/:fileName

Download a converted file (legacy endpoint - requires user ID match).

**Parameters:**
- `userId` - ID of the user who owns the file
- `jobId` - ID of the conversion job
- `fileName` - Name of the output file

**Response:**
- Binary file download with appropriate Content-Type header
- Content-Disposition header for proper filename

**Error Responses:**
- `401` - Unauthorized
- `403` - Access denied (file belongs to different user)
- `404` - Job or file not found

### GET /api/job/:jobId/download/:fileName

Download a converted file (recommended endpoint).

**Parameters:**
- `jobId` - ID of the conversion job
- `fileName` - Name of the output file

**Response:**
- Binary file download with appropriate Content-Type header
- Content-Disposition header for proper filename

**Error Responses:**
- `401` - Unauthorized
- `404` - Job not found or access denied

## Error Codes

- `401 Unauthorized` - Missing or invalid authentication token
- `400 Bad Request` - Invalid request parameters
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error during processing

## Usage Examples

### Using Basic Authentication

```bash
# Get all supported formats
curl -u "email@example.com:password" \
  http://localhost:3000/api/formats

# Get conversion targets for JPG
curl -u "email@example.com:password" \
  http://localhost:3000/api/formats/jpg

# Convert a file from base64
curl -u "email@example.com:password" \
  -X POST -H "Content-Type: application/json" \
  -d '{
    "files": [{"name": "test.jpg", "content": "base64-content"}],
    "convertTo": "png"
  }' \
  http://localhost:3000/api/convert

# Convert a file from URL
curl -u "email@example.com:password" \
  -X POST -H "Content-Type: application/json" \
  -d '{
    "files": [{"name": "document.pdf", "url": "https://example.com/file.pdf"}],
    "convertTo": "docx"
  }' \
  http://localhost:3000/api/convert

# Download converted file
curl -u "email@example.com:password" \
  -o converted.png \
  http://localhost:3000/api/job/123/download/test.png

# Check job status
curl -u "email@example.com:password" \
  http://localhost:3000/api/job/123
```

### Using Cookie Authentication

```bash
# First login to get cookie
curl -c cookies.txt -X POST http://localhost:3000/login \
  -d "email=user@example.com&password=yourpassword"

# Get all supported formats
curl -b cookies.txt \
  http://localhost:3000/api/formats

# Get conversion targets for JPG
curl -b cookies.txt \
  http://localhost:3000/api/formats/jpg

# Convert a file
curl -b cookies.txt \
  -X POST -H "Content-Type: application/json" \
  -d '{
    "files": [{"name": "test.jpg", "content": "base64-content"}],
    "convertTo": "png"
  }' \
  http://localhost:3000/api/convert
```

## Office Document Conversion

ConvertX now supports comprehensive office document conversion through LibreOffice. This enables conversion between various document, spreadsheet, and presentation formats.

### Supported Office Formats

**Documents:**
- Input: `doc`, `docx`, `odt`, `rtf`, `txt`, `html`, `xml`
- Output: `pdf`, `docx`, `odt`, `rtf`, `txt`, `html`

**Spreadsheets:**
- Input: `xls`, `xlsx`, `ods`, `csv`, `tsv`
- Output: `pdf`, `xlsx`, `ods`, `csv`, `html`

**Presentations:**
- Input: `ppt`, `pptx`, `odp`
- Output: `pdf`, `pptx`, `odp`, `html`

### Example: Converting Office Documents

```bash
# Convert DOCX to PDF
curl -u "email@example.com:password" \
  -X POST -H "Content-Type: application/json" \
  -d '{
    "files": [{"name": "document.docx", "content": "base64-content"}],
    "convertTo": "pdf",
    "converterName": "libreoffice"
  }' \
  http://localhost:3000/api/convert

# Convert XLSX to CSV
curl -u "email@example.com:password" \
  -X POST -H "Content-Type: application/json" \
  -d '{
    "files": [{"name": "spreadsheet.xlsx", "content": "base64-content"}],
    "convertTo": "csv",
    "converterName": "libreoffice"
  }' \
  http://localhost:3000/api/convert

# Convert PPT to PDF
curl -u "email@example.com:password" \
  -X POST -H "Content-Type: application/json" \
  -d '{
    "files": [{"name": "presentation.ppt", "content": "base64-content"}],
    "convertTo": "pdf",
    "converterName": "libreoffice"
  }' \
  http://localhost:3000/api/convert
```

## File Input Methods

The API supports two methods for providing files:

1. **Base64 Content**: Include the file content as a base64-encoded string in the `content` field
2. **URL Download**: Provide a URL in the `url` field, and the API will download the file

You can mix both methods in a single request:

```json
{
  "files": [
    {"name": "local.jpg", "content": "base64-content"},
    {"name": "remote.pdf", "url": "https://example.com/document.pdf"}
  ],
  "convertTo": "png"
}
```

## Notes

- Files can be provided as base64-encoded content or URLs to download
- Download URLs are automatically generated in the response for all successful conversions
- The API processes files synchronously, so large files may take time
- Conversion jobs are tracked in the database and can be queried later
- All file paths are sanitized for security
- The API reuses the existing converter system from the web interface
- LibreOffice conversions run in headless mode for optimal performance