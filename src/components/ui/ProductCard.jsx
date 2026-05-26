import { Link } from "react-router-dom";
import { formatResolvedPrice } from "../../utils/currency";
import { getProductPriceDetails } from "../../utils/productPricing";

function ProductCard({ product }) {
  const productId = product._id || product.id;
  const pricing = getProductPriceDetails(product);

  return (
    <div style={styles.card}>
      <img
        src={product.image || "https://picsum.photos/400"}
        alt={product.name}
        style={styles.image}
      />
      <h3>{product.name}</h3>
      <p>{formatResolvedPrice(pricing)}</p>
      <Link to={`/product/${productId}`}>
        <button style={styles.button}>View Product</button>
      </Link>
    </div>
  );
}

const styles = {
  card: {
    border: "1px solid #ddd",
    padding: "15px",
    borderRadius: "8px",
    textAlign: "center",
    background: "#fff"
  },
  image: {
    width: "100%",
    height: "150px",
    objectFit: "cover"
  },
  button: {
    marginTop: "10px",
    padding: "8px 12px",
    background: "#f0c14b",
    border: "none",
    cursor: "pointer"
  }
};

export default ProductCard;
