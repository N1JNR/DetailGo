# File Upload Security — Instruction 14

## Coverage

CWE-434 (Unrestricted Upload), CWE-22 (Path Traversal / Zip Slip), CWE-732
OWASP A05:2021

---

## File Upload Checks

### 1. MIME Type Validation (Server-Side)

```js
// 🔴 Trust Content-Type header from client (easily forged)
if (req.headers['content-type'] === 'image/jpeg') {
  accept();
}

// 🔴 Trust file extension only
if (file.name.endsWith('.jpg')) {
  accept();
}

// 🟢 Read actual file bytes (magic bytes) to detect real type
import { fileTypeFromBuffer } from 'file-type';
const buffer = await readFileBuffer(file);
const type = await fileTypeFromBuffer(buffer);
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
if (!type || !ALLOWED_TYPES.includes(type.mime)) {
  return res.status(400).json({ error: 'Invalid file type' });
}
```

### 2. File Size Limits

```js
// 🔴 No size limit = storage exhaustion / DoS
// 🟢 Enforce strict size limits
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024,  // 5MB max
    files: 5                     // max 5 files per request
  }
})

// Also limit at nginx/server level:
# nginx: client_max_body_size 10M;
```

### 3. Executable Extensions Blocked

```js
// 🔴 Accepting executable files
// .php, .php3, .phtml, .php5
// .js (in wrong context), .jsp, .aspx, .exe
// .sh, .bat, .cmd, .ps1
// .py (in web-accessible directory)

const BLOCKED_EXTENSIONS = [
  '.php',
  '.php3',
  '.phtml',
  '.php5',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.asp',
  '.aspx',
  '.jsp',
  '.exe',
  '.sh',
  '.bat',
  '.cmd',
  '.ps1',
  '.py',
  '.rb',
  '.pl',
  '.cgi',
];

const ext = path.extname(file.name).toLowerCase();
if (BLOCKED_EXTENSIONS.includes(ext)) {
  return res.status(400).json({ error: 'File type not allowed' });
}
```

### 4. Store Outside Web Root

```js
// 🔴 Files stored in public web directory
// uploads/ → accessible as /uploads/malicious.php

// 🟢 Store outside web root, serve via streaming
const uploadDir = '/var/app/uploads/'; // NOT in public/
// Serve via express:
app.get('/files/:id', auth, async (req, res) => {
  const file = await File.findOne({ _id: req.params.id, userId: req.user.id });
  if (!file) return res.status(404);
  res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
  res.setHeader('Content-Type', file.mimeType);
  fs.createReadStream(file.path).pipe(res);
});
```

### 5. Randomize Stored Filename

```js
// 🔴 Use original filename (path traversal, overwrite attacks)
const filePath = path.join('/uploads/', file.originalname); // ← ../../../etc/passwd

// 🟢 Generate random filename, store mapping in DB
const storedName = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname);
const filePath = path.join('/var/app/uploads/', storedName);
await db.files.create({ originalName: file.originalname, storedName, userId: req.user.id });
```

### 6. Path Traversal in Filename

```js
// 🔴 Original filename used in path construction
const filePath = path.join(uploadDir, req.body.filename);
// Attack: filename = "../../../etc/passwd"

// 🟢 Sanitize filename
const safeName = path.basename(req.body.filename); // strips directory components
// Also randomize (see check 5)
```

### 7. Symlink Attack Prevention

```js
// 🔴 Symlink in uploaded archive points to system file
// /uploads/exploit.zip contains symlink: link -> /etc/passwd

// 🟢 Resolve real path after extraction
const realPath = fs.realpathSync(extractedFile);
if (!realPath.startsWith(path.resolve(uploadDir))) {
  throw new Error('Symlink attack detected');
}
```

---

## Zip Slip (Archive Extraction)

### 8. Validate All Paths in Archive

```js
// Already covered in instruction 11, repeated here for emphasis
const zip = new AdmZip(uploadedArchive);
for (const entry of zip.getEntries()) {
  const destPath = path.resolve(extractDir, entry.entryName);
  if (!destPath.startsWith(path.resolve(extractDir) + path.sep)) {
    return res.status(400).json({ error: 'Malicious archive rejected' });
  }
}
```

---

## Image Processing Safety

### 9. Image Parser Security

```js
// 🔴 Some image parsers have vulnerabilities (ImageMagick, Pillow)
// Attack: Polyglot files (JPEG that is also valid PHP)
// Attack: SVG with embedded script
// Attack: EXIF data with malicious content

// 🟢 Strip EXIF data from images
import sharp from 'sharp';
await sharp(inputBuffer)
  .rotate() // corrects orientation AND strips EXIF
  .toFile(outputPath);

// 🟢 Re-encode images (converts and strips all metadata)
await sharp(inputBuffer).jpeg({ quality: 85 }).toFile(outputPath);

// 🔴 Never serve user-uploaded SVG directly
// SVG can contain: <script>, external references, CSS injection
// 🟢 Either reject SVG or sanitize with DOMPurify before serving
```

### 10. Virus/Malware Scanning (Guided)

For production apps handling untrusted files:

```
// Advise user to integrate ClamAV or similar
// clamscan --remove uploaded-file.exe
// Or use cloud service: VirusTotal API, AWS GuardDuty
```

---

## Cloud Storage (S3, GCS, Azure Blob)

### 11. Pre-signed URLs

```js
// 🟢 Use pre-signed URLs for direct upload (bypass your server)
const command = new PutObjectCommand({
  Bucket: process.env.S3_BUCKET,
  Key: `uploads/${userId}/${randomName}`,
  ContentType: 'image/jpeg',
  ContentLength: maxFileSize,
});
const url = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min
// Validate the upload on your server AFTER completion
```

### 12. Bucket Not Public

- User-uploaded files must never be in a public-read bucket
- Serve via pre-signed download URLs with expiry
- Check bucket policy has no public access grants
