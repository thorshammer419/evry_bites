import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createCallerFactory } from "../../../server/trpc";
import { appRouter } from "../../../server/routers/_app";

const createCaller = createCallerFactory(appRouter);
const caller = createCaller({});

async function toggleActiveAction(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await caller.products.toggleActive({ id });
  revalidatePath("/admin/products");
}

export default async function AdminProductsPage() {
  const products = await caller.products.listAll();

  return (
    <div className="min-h-screen bg-amber-50 px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/admin/orders"
            className="text-sm text-amber-600 hover:text-amber-800 transition-colors"
          >
            ← Orders
          </Link>
          <div className="flex items-center justify-between mt-3">
            <h1 className="text-2xl font-bold text-amber-900">Products</h1>
            <Link
              href="/admin/products/new"
              className="bg-amber-800 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-amber-700 active:bg-amber-900 transition-colors"
            >
              + Add Product
            </Link>
          </div>
        </div>

        {/* Product list */}
        {products.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm border border-amber-100 p-8 text-center">
            <p className="text-3xl mb-3">🧁</p>
            <p className="text-amber-700 font-medium">No products yet</p>
            <p className="text-sm text-amber-500 mt-1">Add your first product to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((product) => (
              <div
                key={product.id}
                className="bg-white rounded-3xl shadow-sm border border-amber-100 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold text-amber-900 truncate">{product.name}</h2>
                      {product.active ? (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                          Active
                        </span>
                      ) : (
                        <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-amber-700 mt-0.5">
                      ${Number(product.price).toFixed(2)} / {product.batchSize} {product.unitLabel}
                    </p>
                    <p className="text-xs text-amber-500 mt-1 line-clamp-2">{product.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <Link
                    href={`/admin/products/${product.id}/edit`}
                    className="flex-1 text-center border border-amber-200 text-amber-800 px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-50 transition-colors"
                  >
                    Edit
                  </Link>
                  <form action={toggleActiveAction}>
                    <input type="hidden" name="id" value={product.id} />
                    <button
                      type="submit"
                      className={
                        product.active
                          ? "px-4 py-2 rounded-xl text-sm font-medium bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors"
                          : "px-4 py-2 rounded-xl text-sm font-medium bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition-colors"
                      }
                    >
                      {product.active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
