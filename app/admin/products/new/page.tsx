import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import ProductForm from "../ProductForm";
import { createCallerFactory } from "../../../../server/trpc";
import { appRouter } from "../../../../server/routers/_app";
import { uploadProductImage } from "../../../../lib/blob";

const createCaller = createCallerFactory(appRouter);
const caller = createCaller({});

async function createProductAction(formData: FormData) {
  "use server";

  const imageFile = formData.get("image") as File | null;
  let imageUrl: string | undefined;
  if (imageFile && imageFile.size > 0) {
    imageUrl = await uploadProductImage(imageFile);
  }

  await caller.products.create({
    name: formData.get("name") as string,
    description: formData.get("description") as string,
    price: formData.get("price") as string,
    batchSize: parseInt(formData.get("batchSize") as string, 10),
    unitLabel: formData.get("unitLabel") as string,
    imageUrl,
    active: formData.get("active") === "on",
  });

  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export default function NewProductPage() {
  return (
    <div className="min-h-screen bg-amber-50 px-4 py-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-amber-900">New Product</h1>
          <p className="text-sm text-amber-600 mt-1">Add a new product to your menu</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-amber-100 p-6">
          <ProductForm action={createProductAction} submitLabel="Create Product" />
        </div>
      </div>
    </div>
  );
}
