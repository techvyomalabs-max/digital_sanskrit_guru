import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import ProductCard from "../components/ProductCard";
import "./Collection.css";

function getCategoryLabel(product) {
  const raw = String(product?.category || "").trim();

  if (raw && raw.toLowerCase() !== "general") {
    return raw;
  }

  const name = String(product?.name || "").toLowerCase();
  if (name.includes("gita")) return "Gita";
  if (name.includes("grammar")) return "Grammar";
  if (name.includes("vedanta")) return "Vedanta";
  if (name.includes("chant")) return "Chanting";
  return "General";
}

function getAverageRating(product) {
  const reviews = Array.isArray(product?.reviews) ? product.reviews : [];
  if (reviews.length === 0) return Number(product?.rating || 0);
  return reviews.reduce((sum, review) => sum + Number(review?.rating || 0), 0) / reviews.length;
}

function Collection() {
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortOption, setSortOption] = useState("default");

  useEffect(() => {
    setIsLoadingProducts(true);
    axios
      .get("/api/products")
      .then((res) => setProducts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProducts([]))
      .finally(() => setIsLoadingProducts(false));
  }, []);

  const categories = useMemo(() => ["All", ...new Set(products.map((product) => getCategoryLabel(product)))], [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const category = getCategoryLabel(product).toLowerCase();
      return selectedCategory === "All" || category === String(selectedCategory || "").trim().toLowerCase();
    });
  }, [products, selectedCategory]);

  const sortedProducts = useMemo(() => {
    const nextProducts = [...filteredProducts];

    if (sortOption === "priceLow") {
      nextProducts.sort((a, b) => Number(a?.price || 0) - Number(b?.price || 0));
    } else if (sortOption === "priceHigh") {
      nextProducts.sort((a, b) => Number(b?.price || 0) - Number(a?.price || 0));
    } else if (sortOption === "rating") {
      nextProducts.sort((a, b) => getAverageRating(b) - getAverageRating(a));
    } else if (sortOption === "latest") {
      nextProducts.sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
    }

    return nextProducts;
  }, [filteredProducts, sortOption]);

  return (
    <div className="collection-page">
      <section className="collection-shell">
        <div className="collection-head">
          <div>
            <span className="collection-kicker">Catalog</span>
            <h1>Browse the full collection</h1>
            <p>Explore all products with category filters and sorting.</p>
          </div>
          <Link to="/" className="collection-back-link">Back to Home</Link>
        </div>

        <div className="collection-toolbar">
          <div className="collection-category-row">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={selectedCategory === category ? "active" : ""}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="collection-sort-box">
            <label htmlFor="collection-sort">Sort by</label>
            <select id="collection-sort" value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
              <option value="default">Default</option>
              <option value="latest">Latest</option>
              <option value="rating">Highest Rated</option>
              <option value="priceLow">Price: Low to High</option>
              <option value="priceHigh">Price: High to Low</option>
            </select>
          </div>
        </div>

        <div className="collection-results-meta">
          Showing {sortedProducts.length} of {products.length}
          {selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}
        </div>

        <div className="collection-grid">
          {isLoadingProducts ? (
            Array.from({ length: 12 }).map((_, index) => (
              <div key={`collection-skeleton-${index}`} className="collection-skeleton-card">
                <span className="collection-skeleton collection-skeleton-image" />
                <span className="collection-skeleton collection-skeleton-line short" />
                <span className="collection-skeleton collection-skeleton-line" />
                <span className="collection-skeleton collection-skeleton-line medium" />
              </div>
            ))
          ) : sortedProducts.length > 0 ? (
            sortedProducts.map((product) => (
              <ProductCard key={product._id} product={product} showDescription={false} variant="home" />
            ))
          ) : (
            <div className="collection-empty-state">
              <strong>No products found</strong>
              <p>Try another category to see more products.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default Collection;

