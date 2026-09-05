import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import ProductForm from "../ProductForm";
import { createCallerFactory } from "../../../../../server/trpc";
import { appRouter } from "../../../../../server/routers/_app";
import { uploadProductImage } from "../../../../../lib/blob";
import { NullNotifier } from "../../../../../lib/null-notifier";

const createCaller = createCallerFactory(appRouter);
const caller = createCaller({ notifier: new NullNotifier() });

async function createProductAction(_prev: unknown, formData: FormData) {
  "use server";
  try {
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
      posVisible: formData.get("posVisible") === "on",
      storefrontVisible: formData.get("storefrontVisible") === "on",
      ingredients: (formData.get("ingredients") as string) || undefined,
      unitsAvailable: formData.get("unitsAvailable") ? parseInt(formData.get("unitsAvailable") as string, 10) : undefined,
    });

    revalidatePath("/admin/products");
    redirect("/admin/products");
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("[product-create]", err);
    return { error: err instanceof Error ? err.message : "Failed to create product." };
  }
}

export default function NewProductPage() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-blue-900">New Product</h1>
          <p className="text-sm text-blue-600 mt-1">Add a new product to your menu</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-sky-100 p-6">
          <ProductForm action={createProductAction} submitLabel="Create Product" />
        </div>
      </div>
    </div>
  );
}
