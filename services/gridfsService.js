const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { getDB, getGridFS, logMongoOperation, getDBEvents } = require('./db');

/**
 * Upload large evidence file into MongoDB GridFS
 */
async function uploadEvidenceFile(fileBuffer, metadata = {}) {
  const gridfs = getGridFS();
  const db = getDB();

  const filename = metadata.filename || `artifact-${Date.now()}.bin`;
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const t0 = performance.now();

  return new Promise((resolve, reject) => {
    const uploadStream = gridfs.openUploadStream(filename, {
      metadata: {
        evidenceId: metadata.evidenceId || null,
        caseId: metadata.caseId || null,
        contentType: metadata.contentType || 'application/octet-stream',
        sha256Checksum: sha256,
        uploadedBy: metadata.uploadedBy || 'Forensic-Collector',
        description: metadata.description || 'Forensic file capture',
        uploadedAt: new Date()
      }
    });

    uploadStream.on('error', (err) => reject(err));
    uploadStream.on('finish', async () => {
      const fileId = uploadStream.id;
      if (metadata.evidenceId) {
        await db.collection('evidence').updateOne(
          { evidenceId: metadata.evidenceId },
          { $set: { gridfsFileId: fileId, 'metadata.sha256': sha256, updatedAt: new Date() } }
        );
      }

      const t1 = performance.now();
      logMongoOperation('GridFS openUploadStream', 'evidence_vault.files', {
        filename,
        length: fileBuffer.length,
        sha256
      }, t1 - t0, 1);

      const fileResult = {
        fileId,
        filename,
        length: fileBuffer.length,
        sha256Checksum: sha256,
        metadata: {
          evidenceId: metadata.evidenceId || null,
          caseId: metadata.caseId || null,
          contentType: metadata.contentType || 'application/octet-stream',
          sha256Checksum: sha256,
          uploadedBy: metadata.uploadedBy || 'Forensic-Collector',
          description: metadata.description || 'Forensic file capture',
          uploadedAt: new Date()
        }
      };

      getDBEvents().emit('FILE_STORED_IN_GRIDFS', fileResult);
      resolve(fileResult);
    });

    uploadStream.end(fileBuffer);
  });
}

/**
 * Download evidence file from GridFS as stream
 */
function downloadEvidenceFileStream(fileId) {
  const gridfs = getGridFS();
  const objId = typeof fileId === 'string' ? new ObjectId(fileId) : fileId;
  return gridfs.openDownloadStream(objId);
}

/**
 * List all evidence files in GridFS vault
 */
async function listEvidenceFiles(caseId = null) {
  const db = getDB();
  const filter = {};
  if (caseId) filter['metadata.caseId'] = caseId;

  const t0 = performance.now();
  const files = await db.collection('evidence_vault.files')
    .find(filter)
    .sort({ uploadDate: -1 })
    .toArray();
  const t1 = performance.now();

  logMongoOperation('find', 'evidence_vault.files', filter, t1 - t0, files.length);

  return files.map(f => ({
    fileId: f._id,
    filename: f.filename,
    length: f.length,
    chunkSize: f.chunkSize,
    uploadDate: f.uploadDate,
    metadata: f.metadata
  }));
}

/**
 * Delete file from GridFS
 */
async function deleteEvidenceFile(fileId) {
  const gridfs = getGridFS();
  const objId = typeof fileId === 'string' ? new ObjectId(fileId) : fileId;
  await gridfs.delete(objId);
  return { success: true, fileId };
}

module.exports = {
  uploadEvidenceFile,
  downloadEvidenceFileStream,
  listEvidenceFiles,
  deleteEvidenceFile
};
