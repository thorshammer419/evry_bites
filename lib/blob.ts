import { BlobServiceClient } from "@azure/storage-blob";
import { validateProductImage } from "./product-image";

export async function uploadProductImage(file: File): Promise<string> {
  validateProductImage(file);
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
  const containerName =
    process.env.AZURE_STORAGE_CONTAINER_NAME ?? "product-images";

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const blobName = `${crypto.randomUUID()}.${ext}`;

  const container = BlobServiceClient.fromConnectionString(
    connectionString
  ).getContainerClient(containerName);

  const arrayBuffer = await file.arrayBuffer();
  const blockBlob = container.getBlockBlobClient(blobName);
  await blockBlob.uploadData(arrayBuffer, {
    blobHTTPHeaders: { blobContentType: file.type },
  });

  return blockBlob.url;
}
