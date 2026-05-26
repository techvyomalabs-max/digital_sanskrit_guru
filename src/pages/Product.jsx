import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { useCart } from "../hooks/useCart";
import { useAuth } from "../hooks/useAuth";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import "./Product.css";
import { formatCurrencyExact, formatResolvedPrice } from "../utils/currency";
import { getProductPriceDetails } from "../utils/productPricing";

const PRODUCT_EXTRA_DETAILS = {
  soundaryalahari: {
    detailItems: [
      { label: "Publisher", value: "Giri Trading Agency Private Limited" },
      { label: "Publication date", value: "1 January 2013" },
      { label: "Language", value: "Sanskrit" },
      { label: "Print length", value: "848 pages" },
      { label: "ISBN-10", value: "8179503410" },
      { label: "ISBN-13", value: "978-8179503416" },
      { label: "Item Weight", value: "199 g" },
      { label: "Dimensions", value: "21.5 x 14 x 2 cm" },
      { label: "Country of Origin", value: "India" },
      {
        label: "Importer",
        value: "Giri Trading Agency Pvt Ltd 372/1, Pattur Koot Road, Mangadu, Chennai, Tamil Nadu 600122 IN"
      },
      {
        label: "Packer",
        value: "Giri Trading Agency Pvt Ltd 372/1, Pattur Koot Road, Mangadu, Chennai, Tamil Nadu 600122 IN"
      },
      { label: "Generic Name", value: "Book" }
    ],
    extraMeta: [
      { label: "Best Sellers Rank", value: "#80,868 in Books" },
      { label: "Category Rank", value: "#3,405 in Hinduism (Books)" },
      { label: "Customer Reviews", value: "4.4 out of 5 stars (142)" }
    ]
  }
};

function getExtraProductDetails(productName) {
  const normalizedName = String(productName || "").toLowerCase();
  if (normalizedName.includes("soundaryalahari")) {
    return PRODUCT_EXTRA_DETAILS.soundaryalahari;
  }

  return null;
}

function buildAboutProductPoints(product, extraProductDetails) {
  if (Array.isArray(product?.aboutProduct) && product.aboutProduct.length > 0) {
    return product.aboutProduct
      .map((point) => String(point || "").trim())
      .filter(Boolean);
  }

  const points = [
    `${product.category || "General"} title for readers looking for ${String(product.category || "traditional learning").toLowerCase()} material.`,
    product.stock > 0 ? `${product.stock} copies currently available for order.` : "Currently unavailable for ordering.",
    `${Number(product.rating || 0).toFixed(1)} / 5 rating from ${Array.isArray(product.reviews) ? product.reviews.length : 0} customer reviews.`
  ];

  if (extraProductDetails?.detailItems) {
    const language = extraProductDetails.detailItems.find((item) => item.label === "Language");
    const publisher = extraProductDetails.detailItems.find((item) => item.label === "Publisher");
    const printLength = extraProductDetails.detailItems.find((item) => item.label === "Print length");

    if (language) points.unshift(`Published in ${language.value}.`);
    if (publisher) points.push(`Published by ${publisher.value}.`);
    if (printLength) points.push(`${printLength.value} edition for extended reading or parayana use.`);
  }

  return points;
}

function Product() {
  const { id } = useParams();
  const { addToCart } = useCart();
  const { user, token } = useAuth();
  const { selectedAddress } = useDeliveryLocation();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [managedRelatedProducts, setManagedRelatedProducts] = useState([]);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [qty, setQty] = useState(1);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [mainImage, setMainImage] = useState("");

  const renderStars = (value) => {
    const rounded = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    return `${"\u2605".repeat(rounded)}${"\u2606".repeat(5 - rounded)}`;
  };

  const getGalleryImages = (item) => {
    const images = Array.isArray(item?.images)
      ? item.images.map((image) => String(image || "").trim()).filter(Boolean)
      : [];

    if (images.length > 0) return images;

    const fallback = String(item?.image || "").trim();
    return fallback ? [fallback] : [];
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [productRes, allProductsRes, recRes] = await Promise.all([
        axios.get(`/api/products/${id}`).catch(() => ({ data: null })),
        axios.get("/api/products").catch(() => ({ data: [] })),
        axios
          .get(`/api/products/recommend/${id}`)
          .catch(() => ({ data: [] }))
      ]);
      const allProducts = Array.isArray(allProductsRes.data) ? allProductsRes.data : [];
      const recommended = Array.isArray(recRes.data) ? recRes.data : [];
      const found =
        productRes?.data && productRes.data?._id
          ? productRes.data
          : allProducts.find((p) => String(p?._id) === String(id)) || null;
      const galleryImages = getGalleryImages(found);

      setProduct(found);
      setMainImage(galleryImages[0] || "");
      setQty(1);
      setManagedRelatedProducts(
        Array.isArray(found?.relatedProducts)
          ? found.relatedProducts.filter((p) => String(p?._id || "") !== String(id)).slice(0, 8)
          : []
      );
      setRelatedProducts(
        recommended.length > 0
          ? recommended.filter((p) => p?._id !== id).slice(0, 4)
          : allProducts.filter((p) => p._id !== id).slice(0, 4)
      );
    } catch {
      setProduct(null);
      setManagedRelatedProducts([]);
      setRelatedProducts([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {

  if (!product) return;

  const stored = JSON.parse(localStorage.getItem("recentProducts")) || [];

  // remove duplicate if product already exists
  const filtered = stored.filter((p) => p._id !== product._id);

  // add product to start
  const updated = [product, ...filtered].slice(0, 6);

  localStorage.setItem("recentProducts", JSON.stringify(updated));

}, [product]);
  const submitReview = async () => {
    if (!token) {
      alert("Please login to add a review.");
      return;
    }

    try {
      await axios.post(
        `/api/products/${id}/reviews`,
        {
          rating: Number(rating),
          comment
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setRating("5");
      setComment("");
      await loadData();
    } catch (err) {
      const message = err?.response?.data?.message || "Failed to submit review";
      alert(message);
    }
  };

  const handleBuyNow = async () => {
    if (product.stock === 0) {
      return;
    }

    await addToCart(product, qty);
    navigate("/checkout");
  };

  if (loading) return <p style={{ padding: "20px" }}>Loading...</p>;

  if (!product) {
    return (
      <div style={{ padding: "20px" }}>
        <h2>Product not found</h2>
        <Link to="/">Back to Home</Link>
      </div>
    );
  }

  const galleryImages = getGalleryImages(product);
  const extraProductDetails = getExtraProductDetails(product.name);
  const aboutProductPoints = buildAboutProductPoints(product, extraProductDetails);
  const bundleItems = Array.isArray(product.bundleItems) ? product.bundleItems : [];
  const isBundle =
    String(product.productType || "single") === "bundle" ||
    bundleItems.length > 0;
  const isFestiveOffer = product.festiveOffer === true;
  const festiveDiscountPercent = Math.min(95, Math.max(0, Number(product.festiveDiscountPercent || 0)));
  const reviewCount = Array.isArray(product.reviews) ? product.reviews.length : 0;
  const pricing = getProductPriceDetails(product, selectedAddress?.country);
  const displayPrice = Number(pricing.price || 0);
  const displayCurrency = pricing.currency || "INR";
  const bundleOriginalTotal = bundleItems.reduce((sum, item) => {
    const bundledProduct = item?.product;
    return sum + Number(getProductPriceDetails(bundledProduct, selectedAddress?.country).price || 0) * Math.max(1, Number(item?.quantity || 1));
  }, 0);
  const bundleSavings = Math.max(0, bundleOriginalTotal - displayPrice);
  const marketRegularPrice = Number(pricing.marketRegularPrice || 0);
  const hasActiveMarketSale =
    pricing.priceType === "international-market-sale" &&
    marketRegularPrice > displayPrice;
  const festiveOriginalPrice =
    isFestiveOffer && festiveDiscountPercent > 0
      ? Math.round(displayPrice / (1 - festiveDiscountPercent / 100))
      : 0;
  const fallbackOriginalPrice = Math.round(displayPrice * 1.1 * 100) / 100;
  const listPrice = hasActiveMarketSale
    ? marketRegularPrice
    : isBundle && bundleOriginalTotal > displayPrice
      ? bundleOriginalTotal
      : festiveOriginalPrice > displayPrice
        ? festiveOriginalPrice
        : fallbackOriginalPrice;
  const discountPercent = listPrice > 0 ? Math.max(0, Math.round(((listPrice - displayPrice) / listPrice) * 100)) : 0;

  return (
    <>
      <div className="product-breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <span>{product.category || "General"}</span>
        <span>/</span>
        <strong>{product.name}</strong>
      </div>

      <div className="product-container">
        <div className="product-left">
          <div className="image-gallery">
            <div className="thumbnail-column">
              {galleryImages.map((img, i) => (
                <img
                  key={i}
                  src={img || "https://picsum.photos/200"}
                  className={`thumbnail ${mainImage === img ? "active" : ""}`}
                  onClick={() => setMainImage(img)}
                  alt={`${product.name} thumbnail ${i + 1}`}
                  loading="lazy"
                />
              ))}
            </div>

            <div className="main-image-container">
              <img
                src={mainImage || galleryImages[0] || product.image || "https://picsum.photos/500"}
                alt={product.name}
                className="product-main-image"
              />
            </div>
          </div>
        </div>

        <div className="product-center">
          <h1 className="product-title">{product.name}</h1>
          {isBundle ? <p className="product-bundle-pill">Bundle offer</p> : null}
          {isFestiveOffer ? (
            <p className="product-bundle-pill product-festive-pill">
              {festiveDiscountPercent > 0 ? `Festive offer • ${festiveDiscountPercent}% off` : "Festive offer"}
            </p>
          ) : null}
          <p className="product-store-link">Visit the Digital Sanskrit Guru Store</p>
          <p className="rating">{renderStars(product.rating)} <span>{Number(product.rating || 0).toFixed(1)} | {reviewCount} ratings</span></p>
          <hr />
          <div className="price-block">
            <p className="price">
              <strong>{formatResolvedPrice(pricing)}</strong>
              {pricing.priceType === "international-country"
                ? <small>{pricing.matchedCountry} price</small>
                : pricing.isInternational
                  ? <small>International price</small>
                  : null}
            </p>
            {isBundle && bundleOriginalTotal > displayPrice ? (
              <div className="bundle-savings-box">
                <span>Individual total: {formatCurrencyExact(bundleOriginalTotal, displayCurrency)}</span>
                <strong>You save {formatCurrencyExact(bundleSavings, displayCurrency)}</strong>
              </div>
            ) : null}
            <p className="price-meta">
              M.R.P.: <span>{formatCurrencyExact(listPrice, displayCurrency)}</span> ({discountPercent}% off)
            </p>
            <p className="tax-note">Inclusive of all taxes</p>
          </div>
          <p className="stock">
            {product.stock > 0 ? (
              <span className="in-stock">In Stock</span>
            ) : (
              <span className="out-stock">Out of Stock</span>
            )}
          </p>
          <p className="description">{product.description}</p>
        </div>

        <div className="product-right">
          <div className="buy-box">
            <p className="buy-price">{formatResolvedPrice(pricing)}</p>
            <p className="delivery">FREE Delivery</p>
            <p className="buy-box-note">Fastest delivery available at your selected location.</p>

            <div className="qty-box">
              <button className="qty-btn" onClick={() => setQty(qty > 1 ? qty - 1 : 1)}>
                -
              </button>

              <span className="qty-number">{qty}</span>

              <button
                className="qty-btn"
                onClick={() => setQty(qty < (product.stock || 10) ? qty + 1 : qty)}
              >
                +
              </button>
            </div>
            
            {/* <Button type="add-to-cart-button" disabled={false} onClick={() => addToCart(product, qty)} fullWidth="true">
              Add to Cart
            </Button> */}

            <button
              className="add-cart-btn"
              disabled={product.stock === 0}
              onClick={() => addToCart(product, qty)}
            >
              {product.stock === 0 ? "Out of Stock" : "Add to Cart"}
            </button>
            <button
              className="buy-now-btn"
              disabled={product.stock === 0}
              onClick={handleBuyNow}
            >
              {product.stock === 0 ? "Out of Stock" : "Buy Now"}
            </button>
            <p className="secure-line">Secure transaction</p>
          </div>
        </div>
      </div>

      <div className="product-details-section">
        <div className="product-details-head">
          <h3>Product Details</h3>
          <p>Key information about this item before you place your order.</p>
        </div>

        <div className="product-details-grid">
          <div className="product-detail-card">
            <span>Product Name</span>
            <strong>{product.name}</strong>
          </div>
          <div className="product-detail-card">
            <span>Availability</span>
            <strong>{product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}</strong>
          </div>
          <div className="product-detail-card">
            <span>Rating</span>
            <strong>{Number(product.rating || 0).toFixed(1)} / 5</strong>
          </div>
          <div className="product-detail-card">
            <span>Reviews</span>
            <strong>{Array.isArray(product.reviews) ? product.reviews.length : 0} customer reviews</strong>
          </div>
          {isBundle ? (
            <div className="product-detail-card">
              <span>Bundle Items</span>
              <strong>{bundleItems.length} products included</strong>
            </div>
          ) : null}
        </div>

        {isBundle && bundleItems.length > 0 ? (
          <div className="product-details-description">
            <h4>Included in this bundle</h4>
            <ul className="product-bundle-list">
              {bundleItems.map((item, index) => {
                const includedProduct = item?.product;
                const includedId = includedProduct?._id || item?.product;
                const includedName = includedProduct?.name || "Included product";
                return (
                  <li key={`${includedId || "bundle-item"}-${index}`}>
                    <div>
                      <strong>{includedName}</strong>
                      <span>Quantity: {Math.max(1, Number(item?.quantity || 1))}</span>
                    </div>
                    {includedProduct?._id ? (
                      <Link to={`/product/${includedProduct._id}`}>View item</Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="product-details-description">
          <h4>About this product</h4>
          <ul className="product-about-list">
            {aboutProductPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>

        {extraProductDetails?.extraMeta?.length > 0 && (
          <div className="product-extra-meta">
            {extraProductDetails.extraMeta.map((item) => (
              <div key={item.label} className="product-extra-meta-row">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="reviews-section">
        <h3>Customer Reviews</h3>

        {product.reviews && product.reviews.length > 0 ? (
          product.reviews.map((r, index) => (
            <div key={index} className="review-card">
              <strong>{r.user}</strong>
              <p>{renderStars(r.rating)}</p>
              <p>{r.comment}</p>
            </div>
          ))
        ) : (
          <p>No reviews yet</p>
        )}

        <div className="review-form">
          <h4>Add Review</h4>
          {!user && <p>Login to submit a review.</p>}
          <label>Rating</label>
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="5">5 stars</option>
            <option value="4">4 stars</option>
            <option value="3">3 stars</option>
            <option value="2">2 stars</option>
            <option value="1">1 star</option>
          </select>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Write your review..."
          />
          <button className="add-cart-btn" onClick={submitReview}>
            Submit Review
          </button>
        </div>
      </div>

      <div className="related-section">
        <h3>Related Products</h3>
        <div className="related-products">
          {managedRelatedProducts.length > 0 ? (
            managedRelatedProducts.map((p) => (
              <div key={p._id} className="related-card">
                <img src={p.image || "https://picsum.photos/200"} alt={p.name} />
                <h4>{p.name}</h4>
                <p>{formatResolvedPrice(getProductPriceDetails(p, selectedAddress?.country))}</p>
                <Link to={`/product/${p._id}`}>
                  <button className="view-btn">View</button>
                </Link>
              </div>
            ))
          ) : (
            <p className="related-empty">No related products added by admin.</p>
          )}
        </div>
      </div>

      <div className="related-section">
        <h3>You may also like</h3>
        <div className="related-products">
          {relatedProducts.length > 0 ? (
            relatedProducts.map((p) => (
              <div key={p._id} className="related-card">
                <img src={p.image || "https://picsum.photos/200"} alt={p.name} />
                <h4>{p.name}</h4>
                <p>{formatResolvedPrice(getProductPriceDetails(p, selectedAddress?.country))}</p>
                <Link to={`/product/${p._id}`}>
                  <button className="view-btn">View</button>
                </Link>
              </div>
            ))
          ) : (
            <p className="related-empty">No related products found.</p>
          )}
        </div>
      </div>
    </>
  );
}

export default Product;

