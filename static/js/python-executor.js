export class PythonExecutor {
  constructor() {
    this.ready = false;
    this.PythonURL = PYTHON_API_URL;
  }

  async init() {
    this.ready = true;
    return Promise.resolve();
  }

  getExecOutput(response) {
    const header = response.headers.get('X-Exec-Output');
    if (!header) return '';
    try {
      return decodeURIComponent(header);
    } catch {
      return header;
    }
  }

  addBomIfText(fileName, buffer) {
    if (!fileName.match(/\.(txt|csv)$/i)) return buffer;
    const bytes =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (
      bytes.length >= 3 &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf
    ) {
      return bytes;
    }
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const newData = new Uint8Array(bom.length + bytes.length);
    newData.set(bom);
    newData.set(bytes, bom.length);
    return newData;
  }

  async execute(code, convId) {
    if (!code) return { logs: '', images: [], files: [] };

    try {
      const response = await fetch(this.PythonURL, {
        method: 'POST',
        body: code,
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server Error (${response.status}): ${errorText}`);
      }

      const contentType = response.headers.get('Content-Type') || '';

      if (contentType.includes('image/png')) {
        const blob = await response.blob();
        const base64Data = await this.blobToBase64(blob);
        const execOutput = this.getExecOutput(response);
        return {
          output: execOutput || '[Image Generated]',
          logs: execOutput || 'Generated a plot.',
          images: [
            {
              name: 'plot.png',
              type: 'image/png',
              data: base64Data,
            },
          ],
          files: [],
        };
      }

      if (contentType.includes('application/zip')) {
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        const isZip =
          bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

        if (!isZip) {
          const errorText = new TextDecoder().decode(bytes);
          return {
            output:
              '伺服器回應異常 (非有效 ZIP 格式)，原始內容為:\n' + errorText,
            logs: 'Format Error',
            images: [],
            files: [],
          };
        }

        try {
          const recoveryResult = await this.recoverZipManually(buffer);
          if (recoveryResult) {
            const execOutput = this.getExecOutput(response);
            if (execOutput) {
              recoveryResult.logs = execOutput + '\n' + recoveryResult.logs;
            }
            return recoveryResult;
          } else {
            throw new Error('No files found or parsed from ZIP');
          }
        } catch (e) {
          const blob = new Blob([buffer], { type: 'application/zip' });
          const base64Data = await this.blobToBase64(blob);
          const filename = 'result.zip';
          return {
            output: `[File Generated: ${filename}] (Parse failed)`,
            logs: `Generated zip file: ${filename}. Parse failed: ${e.message}`,
            images: [],
            files: [
              { name: filename, type: 'application/zip', data: base64Data },
            ],
          };
        }
      }

      if (contentType.includes('application/octet-stream')) {
        const buffer = await response.arrayBuffer();
        const filename = this.getFilenameFromDisposition(
          response.headers.get('Content-Disposition'),
        );
        const execOutput = this.getExecOutput(response);

        let fileData = new Uint8Array(buffer);
        fileData = this.addBomIfText(filename, fileData);

        let mimeType = 'application/octet-stream';
        if (filename.match(/\.txt$/i)) mimeType = 'text/plain;charset=utf-8';
        else if (filename.match(/\.csv$/i)) mimeType = 'text/csv;charset=utf-8';

        const blob = new Blob([fileData], { type: mimeType });
        const base64Data = await this.blobToBase64(blob);

        return {
          output: execOutput || `[File Generated: ${filename}]`,
          logs: execOutput || `Generated file: ${filename}`,
          images: [],
          files: [
            {
              name: filename,
              type: mimeType,
              data: base64Data,
            },
          ],
        };
      }

      const text = await response.text();
      return {
        output: text,
        logs: text,
        images: [],
        files: [],
      };
    } catch (err) {
      throw err;
    }
  }

  terminate() {}

  async recoverZipManually(buffer) {
    const data = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;
    const images = [];
    const files = [];
    let logs = 'Generated content:\n';

    while (offset + 30 < bytes.length) {
      if (data.getUint32(offset, true) !== 0x04034b50) {
        break;
      }

      const generalFlag = data.getUint16(offset + 6, true);
      const compression = data.getUint16(offset + 8, true);
      const hiddenCompressedSize = data.getUint32(offset + 18, true);
      const fileNameLen = data.getUint16(offset + 26, true);
      const extraFieldLen = data.getUint16(offset + 28, true);

      const fileNameStart = offset + 30;
      const fileNameBytes = bytes.slice(
        fileNameStart,
        fileNameStart + fileNameLen,
      );
      const isUtf8 = (generalFlag & 0x800) !== 0;
      let fileName;
      if (isUtf8) {
        fileName = new TextDecoder('utf-8').decode(fileNameBytes);
      } else {
        try {
          fileName = new TextDecoder('utf-8', { fatal: true }).decode(
            fileNameBytes,
          );
        } catch {
          fileName = Array.from(fileNameBytes)
            .map((b) => String.fromCharCode(b))
            .join('');
        }
      }

      const dataStart = fileNameStart + fileNameLen + extraFieldLen;
      let compressedSize = hiddenCompressedSize;

      if (dataStart + compressedSize > bytes.length) {
        break;
      }

      const fileDataCompressed = bytes.slice(
        dataStart,
        dataStart + compressedSize,
      );
      let fileDataDecompressed;

      if (compression === 0) {
        fileDataDecompressed = fileDataCompressed;
      } else if (compression === 8) {
        try {
          if (typeof DecompressionStream === 'undefined')
            throw new Error('No DecompressionStream');
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          writer.write(fileDataCompressed);
          writer.close();
          const response = new Response(ds.readable);
          fileDataDecompressed = new Uint8Array(await response.arrayBuffer());
        } catch (err) {
          offset = dataStart + compressedSize;
          continue;
        }
      } else {
        offset = dataStart + compressedSize;
        continue;
      }

      fileDataDecompressed = this.addBomIfText(fileName, fileDataDecompressed);
      let mimeType = 'application/octet-stream';
      if (fileName.match(/\.txt$/i)) mimeType = 'text/plain;charset=utf-8';
      else if (fileName.match(/\.csv$/i)) mimeType = 'text/csv;charset=utf-8';

      const blob = new Blob([fileDataDecompressed], { type: mimeType });
      const base64 = await this.blobToBase64(blob);

      if (fileName.match(/\.(png|jpg|jpeg|gif)$/i)) {
        images.push({
          name: fileName,
          type: 'image/png',
          data: base64,
        });
        logs += `- Image: ${fileName}\n`;
      } else {
        files.push({
          name: fileName,
          type: mimeType,
          data: base64,
        });
        logs += `- File: ${fileName}\n`;
      }

      offset = dataStart + compressedSize;
    }

    if (images.length === 0 && files.length === 0) return null;

    return {
      output: files.length > 0 ? `[Files Generated]` : `[Image Generated]`,
      logs: logs,
      images: images,
      files: files,
    };
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  getFilenameFromDisposition(disposition) {
    if (!disposition) return 'output.bin';
    const starMatch = disposition.match(/filename\*\s*=\s*UTF-8''([^;\s]+)/i);
    if (starMatch && starMatch[1]) {
      try {
        return decodeURIComponent(starMatch[1]);
      } catch (e) {}
    }
    const match = disposition.match(/filename="?([^"\n;]+)"?/i);
    if (match && match[1]) {
      const raw = match[1].trim();
      if (/%[0-9A-Fa-f]{2}/.test(raw)) {
        try {
          return decodeURIComponent(raw);
        } catch (e) {}
      }
      try {
        return decodeURIComponent(escape(raw));
      } catch (e) {
        return raw;
      }
    }
    return 'download_file';
  }
}

export const pythonExecutor = new PythonExecutor();
