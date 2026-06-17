import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { db } from "../../../../../lib/db";
import ProductForm from "../../ProductForm";
import { createCallerFactory } from "../../../../../server/trpc";
import { appRouter } from "../../../../../server/routers/_app";
import { uploadProductImage } from "../../../../../lib/blob";
import { NullNotifier } from "../../../../../lib/null-notifier";

const createCaller = createCallerFactory(appRouter);
const caller = createCaller({ notifier: new NullNotifier() });

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;
  const product = await db.product.findUniqueOrThrow({ where: { id } });

  async function updateProductAction(_prev: unknown, formData: FormData) {
    "use server";
    try {
      const imageFile = formData.get("image") as File | null;
      const currentImageUrl = formData.get("currentImageUrl") as string;
      let imageUrl: string | undefined = currentImageUrl || undefined;
      if (imageFile && imageFile.size > 0) {
        imageUrl = await uploadProductImage(imageFile);
      }

      await caller.products.update({
        id,
        name: formData.get("name") as string,
        description: formData.get("description") as string,
        price: formData.get("price") as string,
        batchSize: parseInt(formData.get("batchSize") as string, 10),
        unitLabel: formData.get("unitLabel") as string,
        imageUrl,
        active: formData.get("active") === "on",
        ingredients: (formData.get("ingredients") as string) || undefined,
        supplyCostPerBatch: (formData.get("supplyCostPerBatch") as string) || undefined,
        unitsAvailable: formData.get("unitsAvailable") ? parseInt(formData.get("unitsAvailable") as string, 10) : undefined,
      });

      revalidatePath("/admin/products");
      redirect("/admin/products");
    } catch (err) {
      if (isRedirectError(err)) throw err;
      console.error("[product-update]", err);
      return { error: err instanceof Error ? err.message : "Failed to save product." };
    }
  }

  return (
    <div className="px-4 py-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-amber-900">Edit Product</h1>
          <p className="text-sm text-amber-600 mt-1">{product.name}</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-amber-100 p-6">
          <ProductForm
            action={updateProductAction}
            defaultValues={{
              name: product.name,
              description: product.description,
              price: String(product.price),
              batchSize: product.batchSize,
              unitLabel: product.unitLabel,
              imageUrl: product.imageUrl,
              active: product.active,
              ingredients: product.ingredients,
              supplyCostPerBatch: product.supplyCostPerBatch
                ? String(product.supplyCostPerBatch)
                : null,
              unitsAvailable: product.unitsAvailable,
            }}
            submitLabel="Save Changes"
          />
        </div>
      </div>
    </div>
  );
}
