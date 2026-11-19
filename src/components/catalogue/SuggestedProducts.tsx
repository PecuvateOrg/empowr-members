import { suggestedProducts } from "@/lib/suggested-products";

export function SuggestedProducts() {
  return (
        <section className="mt-8 min-w-0" aria-labelledby="suggested-products-heading">
          <p className="text-sm font-extrabold uppercase tracking-wide text-blue-dark mb-3">The Empowr Shop</p>
          <h2 id="suggested-products-heading" className="text-xl font-black text-black mb-3">Get ready for your skating journey.</h2>
          <p className="text-base text-mid leading-relaxed mb-6">Thinking about your own kit? Explore our recommended skates, a backpack for your sessions and a little Empowr pride. These are optional purchases; see the course information above for skate hire details.</p>
          <p id="suggested-products-help" className="text-sm text-mid mb-3">Swipe or scroll to explore all four products. You can also tab through the links.</p>
          <div className="flex gap-4 overflow-x-auto snap-x snap-proximity pb-4" tabIndex={0} role="region" aria-label="Suggested products" aria-describedby="suggested-products-help">
            {suggestedProducts.map((product) => (
              <a key={product.href} href={product.href} className="group w-64 shrink-0 snap-start rounded-2xl border border-line bg-card overflow-hidden no-underline flex flex-col focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-dark hover:border-blue-dark transition-colors">
                <div className="h-40 bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={product.image} alt={product.name} width={600} height={450} loading="lazy" className="w-full h-full object-contain" />
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <p className="text-sm font-extrabold text-blue-dark mb-2">{product.label}</p>
                  <h3 className="text-lg font-black text-black mb-2">{product.name}</h3>
                  <p className="text-base text-mid leading-relaxed mb-4 flex-1">{product.description}</p>
                  <span className="text-base font-extrabold text-blue-dark underline underline-offset-4 group-hover:decoration-2">View product<span className="sr-only">: {product.name}</span></span>
                </div>
              </a>
            ))}
          </div>
          <p className="text-sm text-mid mt-4">Current sizes, colours, prices and availability are shown on each product page.</p>
        </section>

  );
}
