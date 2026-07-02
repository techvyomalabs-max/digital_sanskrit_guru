import ProductCard from "../components/ProductCard";
import { useWishlist } from "../hooks/useWishlist";
import "./Wishlist.css";

function Wishlist() {
  const { wishlist } = useWishlist();

  return (
    <div className="wishlist-page">
      <section className="wishlist-shell">
        <div className="wishlist-header">
          <h1>My Wishlist</h1>
          <p>Keep your saved products in one place and revisit them anytime.</p>
        </div>

        <div className="wishlist-grid">
          {wishlist.length > 0 ? (
            wishlist.map((product) => <ProductCard key={product._id} product={product} variant="wishlist" />)
          ) : (
            <div className="wishlist-empty">
              <h2>Your wishlist is empty</h2>
              <p>Save products from the catalog to compare them later.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default Wishlist;
