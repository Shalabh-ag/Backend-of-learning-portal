const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Initialize Azure Blob Service Client
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(process.env.CONTAINER_NAME);

// Function to upload files to Azure Blob Storage
async function uploadToAzure(file) {
  try {
    const blobName = `${uuidv4()}-${file.originalname}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.mimetype }
    });

    return blockBlobClient.url;
  } catch (error) {
    console.error('Error uploading to Azure Blob Storage:', error);
    throw new Error(`File upload failed: ${error}`);
  }
}

// Function to delete blobs from Azure Blob Storage
async function deleteBlobFromAzure(blobUrl) {
  try {
    let blobName = blobUrl.split('/').pop();
    blobName = decodeURIComponent(blobName);

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.delete();
    console.log(`Blob deleted successfully: ${blobName}`);
  } catch (error) {
    console.error(`Failed to delete blob: ${error.message}`);
  }
}

module.exports = {
  uploadToAzure,
  deleteBlobFromAzure
};
