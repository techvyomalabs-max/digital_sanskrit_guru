import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "../ProductCard";
import "./ProductRow.css";

/**
 * A titled row of product cards that scrolls sideways: no scrollbar, cards snap into place,
 * and the arrows only show when there is more to see in that direction.
 */
function ProductRow({ title, products = [], emptyText = "" }) {
  const rowRef = useRef(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

  const updateEdges = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const max = row.scrollWidth - row.clientWidth;
    setEdges({ prev: row.scrollLeft > 4, next: max - row.scrollLeft > 4 });
  }, []);

  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [products, updateEdges]);

  const scroll = (direction) => {
    const row = rowRef.current;
    if (!row) return;
    row.scrollBy({ left: direction * row.clientWidth * 0.85, behavior: "smooth" });
  };

  if (products.length === 0) {
    return emptyText ? (
      <section className="related-section product-row-section">
        <h3>{title}</h3>
        <p className="related-empty">{emptyText}</p>
      </section>
    ) : null;
  }

  return (
    <section className="related-section product-row-section" aria-label={title}>
      <h3>{title}</h3>
      <div className="product-row-wrap" data-can-prev={edges.prev} data-can-next={edges.next}>
        <button type="button" className="product-row-arrow left" onClick={() => scroll(-1)} aria-label={`Previous ${title}`} tabIndex={edges.prev ? 0 : -1}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className="product-row" ref={rowRef} onScroll={updateEdges}>
          {products.map((p) => (
            <div key={p._id} className="product-row-item">
              <ProductCard product={p} showDescription={false} variant="home" />
            </div>
          ))}
        </div>
        <button type="button" className="product-row-arrow right" onClick={() => scroll(1)} aria-label={`Next ${title}`} tabIndex={edges.next ? 0 : -1}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

export default ProductRow;
