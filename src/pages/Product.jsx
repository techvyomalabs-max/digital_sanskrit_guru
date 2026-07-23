import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { useCart } from "../hooks/useCart";
import { useAuth } from "../hooks/useAuth";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import { useToast } from "../hooks/useToast";
import { useWishlist } from "../hooks/useWishlist";
import "./Product.css";
import { formatCurrencyExact, formatResolvedPrice } from "../utils/currency";
import { getProductPriceDetails } from "../utils/productPricing";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";

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

function getProductTrailerEmbed(url) {
  const value = String(url || "").trim();
  if (!value) return null;

  const youtubeMatch =
    value.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([^&?/]+)/i) || null;
  if (youtubeMatch?.[1]) {
    return {
      type: "iframe",
      provider: "youtube",
      videoId: youtubeMatch[1],
      src: `https://www.youtube.com/embed/${youtubeMatch[1]}`,
      title: "Product trailer"
    };
  }

  const vimeoMatch = value.match(/vimeo\.com\/(?:video\/)?(\d+)/i) || null;
  if (vimeoMatch?.[1]) {
    return {
      type: "iframe",
      provider: "vimeo",
      videoId: vimeoMatch[1],
      src: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      title: "Product trailer"
    };
  }

  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(value)) {
    return { type: "video", src: value, title: "Product trailer" };
  }

  return { type: "link", src: value, title: "Product trailer" };
}

function buildProductMediaItems(product, galleryImages, trailerVideo) {
  const imageItems = galleryImages.map((src, index) => ({
    key: `image-${index}`,
    kind: "image",
    src,
    alt: `${product?.name || "Product"} image ${index + 1}`,
    thumbnail: src
  }));

  if (!trailerVideo) return imageItems;

  const fallbackThumb = galleryImages[0] || String(product?.image || "").trim() || "/no-image.webp";
  const thumbnail =
    trailerVideo.provider === "youtube" && trailerVideo.videoId
      ? `https://img.youtube.com/vi/${trailerVideo.videoId}/hqdefault.jpg`
      : fallbackThumb;

  return [
    ...imageItems,
    {
      key: "trailer-video",
      kind: "trailer",
      trailerType: trailerVideo.type,
      src: trailerVideo.src,
      title: trailerVideo.title,
      thumbnail
    }
  ];
}

// ── Skeleton loader for product page ─────────────────────────────────────────
function ProductSkeleton() {
  return (
    <div className="product-skeleton-wrap" aria-label="Loading product" aria-busy="true">
      <div className="product-container">
        <div className="product-left">
          <div className="image-gallery">
            <div className="thumbnail-column">
              {[0, 1, 2].map((i) => (
                <span key={i} className="product-sk product-sk-thumb" />
              ))}
            </div>
            <span className="product-sk product-sk-main-img" />
          </div>
        </div>
        <div className="product-center">
          <span className="product-sk product-sk-title" />
          <span className="product-sk product-sk-line product-sk-short" />
          <span className="product-sk product-sk-price" />
          <span className="product-sk product-sk-line" />
          <span className="product-sk product-sk-line product-sk-medium" />
        </div>
        <div className="product-right">
          <div className="buy-box">
            <span className="product-sk product-sk-price" />
            <span className="product-sk product-sk-btn" />
            <span className="product-sk product-sk-btn" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Not-found page ────────────────────────────────────────────────────────────
function ProductNotFound() {
  return (
    <div className="product-not-found">
      <div className="product-not-found-icon" aria-hidden="true">📦</div>
      <h1>Product not found</h1>
      <p>We couldn't find the product you're looking for. It may have been removed or the link is incorrect.</p>
      <div className="product-not-found-actions">
        <Link to="/" className="add-cart-btn">Go to Home</Link>
        <Link to="/collection" className="buy-now-btn">Browse Collection</Link>
      </div>
    </div>
  );
}

function Product() {
  const { id } = useParams();
  const { addToCart } = useCart();
  const { user, token } = useAuth();
  const { selectedAddress } = useDeliveryLocation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { wishlist, addToWishlist, removeFromWishlist } = useWishlist();

  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [hasMoreReviews, setHasMoreReviews] = useState(false);
  const [isLoadingMoreReviews, setIsLoadingMoreReviews] = useState(false);
  useDocumentMetadata(product?.name, product?.description);
  const [managedRelatedProducts, setManagedRelatedProducts] = useState([]);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [qty, setQty] = useState(1);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [selectedMedia, setSelectedMedia] = useState(null);

  const [purchasedProducts, setPurchasedProducts] = useState([]);
  const [purchaseAsGift, setPurchaseAsGift] = useState(false);

  // Bulk Enquiry Form States
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkName, setBulkName] = useState("");
  const [bulkEmail, setBulkEmail] = useState("");
  const [bulkPhone, setBulkPhone] = useState("");
  const [bulkQty, setBulkQty] = useState(20);
  const [bulkInst, setBulkInst] = useState("");
  const [bulkMsg, setBulkMsg] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState(false);
  const [bulkError, setBulkError] = useState("");

  useEffect(() => {
    if (token) {
      axios.get("/api/orders/my", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        const list = [];
        if (Array.isArray(res.data)) {
          res.data.forEach((order) => {
            const isPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
            if (!isPaid || !Array.isArray(order.items)) return;
            order.items.forEach((item) => {
              const isGiftItem = Boolean(order.isGift || item.giftCode);
              if (isGiftItem && !order.isRedeemedGift) {
                return;
              }
              const pId = String(item.product || item._id || item.id || "").trim();
              if (pId) {
                list.push(pId);
              }
            });
          });
        }
        setPurchasedProducts(list);
      })
      .catch((err) => console.error("Error fetching my orders:", err));
    }
  }, [token]);

  const isWishlisted = product ? wishlist.some((p) => p._id === product._id) : false;

  const handleWishlistToggle = () => {
    if (!product) return;
    if (isWishlisted) {
      removeFromWishlist(product._id);
      showToast("Removed from wishlist");
    } else {
      addToWishlist(product);
      showToast("Added to wishlist");
    }
  };

  const handleShare = () => {
    if (!product) return;
    const shareUrl = `${window.location.origin}/#/product/${product._id}`;
    if (navigator.share) {
      navigator.share({
        title: product.name,
        text: product.description || `Check out ${product.name} on Digital Sanskrit Guru!`,
        url: shareUrl
      }).catch((err) => console.log("Sharing failed", err));
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast("Link copied to clipboard!");
      }).catch((err) => console.error("Failed to copy link", err));
    }
  };

  const renderStars = (value) => {
    const rounded = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
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
      setRelatedProducts([]);

      // ── Fix #6: No double-fetch fallback — just fetch by ID directly ────────
      const productRes = await axios.get(`/api/products/${id}`).catch(() => ({ data: null }));
      const found = productRes?.data?._id ? productRes.data : null;

      const galleryImages = found ? getGalleryImages(found) : [];

      setProduct(found);
      if (found) {
        setReviews(found.reviews || []);
        setHasMoreReviews((found.reviewsCount || 0) > (found.reviews?.length || 0));
      } else {
        setReviews([]);
        setHasMoreReviews(false);
      }
      setSelectedMedia(
        galleryImages[0]
          ? {
            key: "image-0",
            kind: "image",
            src: galleryImages[0],
            alt: `${found?.name || "Product"} image 1`,
            thumbnail: galleryImages[0]
          }
          : null
      );
      setQty(found && found.productType === "bulk" ? 10 : 1);
      setManagedRelatedProducts(
        Array.isArray(found?.relatedProducts)
          ? found.relatedProducts.filter((p) => String(p?._id || "") !== String(id)).slice(0, 8)
          : []
      );

      if (!found) {
        setRelatedProducts([]);
        return;
      }

      setLoading(false);

      const recRes = await axios.get(`/api/products/recommend/${id}`).catch(() => ({ data: [] }));
      const recommended = Array.isArray(recRes.data) ? recRes.data : [];
      setRelatedProducts(recommended.filter((p) => p?._id !== id).slice(0, 4));
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
    try {
      const stored = JSON.parse(localStorage.getItem("recentProducts")) || [];
      const filtered = stored.filter((p) => p._id !== product._id);
      const updated = [product, ...filtered].slice(0, 6);
      localStorage.setItem("recentProducts", JSON.stringify(updated));
    } catch {
      // ignore
    }
  }, [product]);

  useEffect(() => {
    if (!product) return undefined;

    const pricing = getProductPriceDetails(product, selectedAddress?.country);
    const displayPrice = Number(pricing.price || 0);
    const displayCurrency = pricing.currency || "INR";

    const schemaData = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": product.name,
      "image": product.image ? [product.image] : [],
      "description": product.description || `Buy ${product.name} on Digital Sanskrit Guru.`,
      "brand": {
        "@type": "Brand",
        "name": "Digital Sanskrit Guru"
      },
      "offers": {
        "@type": "Offer",
        "url": window.location.href,
        "priceCurrency": displayCurrency,
        "price": displayPrice.toString(),
        "itemCondition": "https://schema.org/NewCondition",
        "availability": product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
      }
    };

    if (product.rating) {
      schemaData.aggregateRating = {
        "@type": "AggregateRating",
        "ratingValue": product.rating.toString(),
        "reviewCount": Array.isArray(product.reviews) ? product.reviews.length.toString() : "0"
      };
    }

    const scriptId = "product-jsonld-schema";
    let scriptTag = document.getElementById(scriptId);
    if (!scriptTag) {
      scriptTag = document.createElement("script");
      scriptTag.id = scriptId;
      scriptTag.type = "application/ld+json";
      document.head.appendChild(scriptTag);
    }
    scriptTag.text = JSON.stringify(schemaData);

    return () => {
      const tag = document.getElementById(scriptId);
      if (tag) tag.remove();
    };
  }, [product, selectedAddress]);

  const submitReview = async () => {
    setReviewError("");

    // ── Fix #8: gate review submission for logged-out users ──────────────────
    if (!token) {
      showToast("Please login to submit a review.");
      return;
    }
    if (!comment.trim()) {
      setReviewError("Please write a review comment.");
      return;
    }

    try {
      await axios.post(
        `/api/products/${id}/reviews`,
        { rating: Number(rating), comment },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setRating("5");
      setComment("");
      setReviewError("");
      showToast("Review submitted!");
      await loadData();
    } catch (err) {
      const message = err?.response?.data?.message || "Failed to submit review";
      setReviewError(message);
    }
  };

  const handleLoadMoreReviews = async () => {
    if (isLoadingMoreReviews) return;
    setIsLoadingMoreReviews(true);
    try {
      const response = await axios.get(
        `/api/products/${id}/reviews?skip=${reviews.length}&limit=10`
      );
      const newReviews = response.data;
      if (Array.isArray(newReviews) && newReviews.length > 0) {
        setReviews((current) => [...current, ...newReviews]);
        if (newReviews.length < 10) {
          setHasMoreReviews(false);
        }
      } else {
        setHasMoreReviews(false);
      }
    } catch {
      showToast("Failed to load more reviews.");
    } finally {
      setIsLoadingMoreReviews(false);
    }
  };

  useEffect(() => {
    if (user) {
      setBulkName(user.name || "");
      setBulkEmail(user.email || "");
    }
  }, [user, showBulkModal]);

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    setBulkError("");
    setBulkSuccess(false);

    if (!bulkName || !bulkEmail || !bulkQty) {
      setBulkError("Please fill in all required fields (Name, Email, and Quantity).");
      return;
    }

    try {
      setBulkSubmitting(true);
      await axios.post(`/api/products/${product._id}/bulk-enquiry`, {
        name: bulkName,
        email: bulkEmail,
        phone: bulkPhone,
        quantity: Number(bulkQty),
        institution: bulkInst,
        message: bulkMsg
      });
      setBulkSuccess(true);
      setBulkPhone("");
      setBulkInst("");
      setBulkMsg("");
      setTimeout(() => {
        setShowBulkModal(false);
        setBulkSuccess(false);
      }, 2500);
    } catch (err) {
      setBulkError(err.response?.data?.message || "Failed to submit wholesale quote request. Please try again.");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleBuyNow = async () => {
    if (product.stock === 0) return;
    await addToCart(product, qty);
    navigate("/checkout");
  };

  // ── Fix #12: Styled skeleton loader instead of raw <p> ──────────────────────
  if (loading) return <ProductSkeleton />;

  // ── Fix #13: Styled not-found page ──────────────────────────────────────────
  if (!product) return <ProductNotFound />;

  const galleryImages = getGalleryImages(product);
  const extraProductDetails = getExtraProductDetails(product.name);
  const aboutProductPoints = buildAboutProductPoints(product, extraProductDetails);
  const bundleItems = Array.isArray(product.bundleItems) ? product.bundleItems : [];
  const isBundle =
    String(product.productType || "single") === "bundle" || bundleItems.length > 0;
  const isFestiveOffer = product.festiveOffer === true;
  const festiveDiscountPercent = Math.min(95, Math.max(0, Number(product.festiveDiscountPercent || 0)));
  const reviewCount = product.reviewsCount !== undefined ? product.reviewsCount : (Array.isArray(product.reviews) ? product.reviews.length : 0);
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
    pricing.priceType === "international-market-sale" && marketRegularPrice > displayPrice;
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
  const trailerVideo = getProductTrailerEmbed(product.trailerVideoUrl);
  const mediaItems = buildProductMediaItems(product, galleryImages, trailerVideo);
  const activeMedia = selectedMedia || mediaItems[0] || null;
  const isKindleBook = Boolean(
    product.kindleLink ||
    String(product.digitalType || "").toLowerCase().includes("kindle") ||
    String(product.name || "").toLowerCase().includes("kindle")
  );

  const isWebVersion = product && (
    product.isDigital && 
    (String(product.digitalType || "").toLowerCase().includes("web") || 
     String(product.name || "").toLowerCase().includes("web") ||
     String(product.name || "").toLowerCase().includes("flipbook") ||
     String(product.format || "").toLowerCase().includes("web") ||
     String(product.format || "").toLowerCase().includes("flipbook"))
  ) && !isKindleBook;

  const alreadyPurchased = product && purchasedProducts.includes(String(product._id));
  const hasPurchasedWebVersion = isWebVersion && alreadyPurchased;

  return (
    <>
      <div className="product-container">
        <div className="product-left">
          <div className="image-gallery">
            <div className="thumbnail-column">
              {mediaItems.map((item, i) => (
                item.kind === "image" ? (
                  <img
                    key={item.key}
                    src={item.thumbnail || "/no-image.webp"}
                    className={`thumbnail ${activeMedia?.key === item.key ? "active" : ""}`}
                    onClick={() => setSelectedMedia(item)}
                    alt={`${product.name} thumbnail ${i + 1}`}
                    width="120"
                    height="120"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <button
                    key={item.key}
                    type="button"
                    className={`thumbnail thumbnail-video ${activeMedia?.key === item.key ? "active" : ""}`}
                    onClick={() => setSelectedMedia(item)}
                    aria-label="Open product trailer"
                  >
                    <img
                      src={item.thumbnail || "/no-image.webp"}
                      alt={`${product.name} trailer thumbnail`}
                      width="120"
                      height="120"
                      loading="lazy"
                      decoding="async"
                    />
                    <span>Trailer</span>
                  </button>
                )
              ))}
            </div>

            <div className="main-image-container">
              <div className="product-image-actions">
                <button
                  type="button"
                  className={`product-image-action-btn fav-btn ${isWishlisted ? "active" : ""}`}
                  onClick={handleWishlistToggle}
                  aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill={isWishlisted ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="heart-icon"
                    width="16"
                    height="16"
                  >
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                  </svg>
                </button>

                <button
                  type="button"
                  className="product-image-action-btn share-btn"
                  onClick={handleShare}
                  aria-label="Share product"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="share-icon"
                    width="16"
                    height="16"
                  >
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </button>
              </div>
              {activeMedia?.kind === "trailer" ? (
                activeMedia.trailerType === "iframe" ? (
                  <iframe
                    src={activeMedia.src}
                    title={activeMedia.title}
                    className="product-main-video"
                    loading="eager"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : activeMedia.trailerType === "video" ? (
                  <video className="product-main-video" controls preload="metadata">
                    <source src={activeMedia.src} />
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <a className="product-main-video-link" href={activeMedia.src} target="_blank" rel="noreferrer">
                    Open Trailer Video
                  </a>
                )
              ) : (
                <img
                  src={activeMedia?.src || galleryImages[0] || product.image || "/no-image.webp"}
                  alt={product.name}
                  className="product-main-image"
                  width="800"
                  height="800"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
              )}
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
          {/* <p className="product-store-link">Visit the Digital Sanskrit Guru Store</p> */}
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
          <div className="description" dangerouslySetInnerHTML={{ __html: product.description }} />
        </div>

        <div className="product-right">
          <div className="buy-box">
            <p className="buy-price">{formatResolvedPrice(pricing)}</p>
            <p className="delivery">Fast Delivery</p>
            <p className="buy-box-note">Fastest delivery available at your selected location.</p>

            {isKindleBook ? (
              <div style={{ marginTop: "12px" }}>
                <a
                  href={product.kindleLink || "https://www.amazon.in/s?k=kindle+digital+sanskrit+guru"}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "14px 18px",
                    borderRadius: "8px",
                    backgroundColor: "#ff9900",
                    color: "#111",
                    fontWeight: 700,
                    fontSize: "15px",
                    textDecoration: "none",
                    boxShadow: "0 4px 12px rgba(255, 153, 0, 0.35)",
                    transition: "transform 0.15s ease"
                  }}
                >
                  📱 Buy Kindle Edition on Amazon ↗
                </a>
                <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--site-text-soft)", textAlign: "center" }}>
                  Kindle books are sold and fulfilled directly on Amazon Kindle Store.
                </p>
              </div>
            ) : (
              <>
                {hasPurchasedWebVersion ? (
                  <div style={{ margin: "10px 0 16px", padding: "12px", borderRadius: "8px", border: "1px solid #dc2626", backgroundColor: "#fef2f2", color: "#991b1b", fontSize: "13px", lineHeight: "1.4", textAlign: "left" }}>
                    <p style={{ margin: 0, fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>⚠️</span> You have already purchased this web version.
                    </p>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", color: "var(--site-text)", cursor: "pointer", fontSize: "12.5px", fontWeight: "600" }}>
                      <input
                        type="checkbox"
                        checked={purchaseAsGift}
                        onChange={(e) => setPurchaseAsGift(e.target.checked)}
                        style={{ width: "16px", height: "16px", cursor: "pointer" }}
                      />
                      🎁 Purchase as a gift for someone else
                    </label>
                  </div>
                ) : null}

                {product.productType === "bulk" ? (
                  <div className="qty-box" style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "16px 0", gap: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "600" }}>Select Quantity:</span>
                    <select
                      value={qty}
                      onChange={(e) => setQty(Number(e.target.value))}
                      style={{
                        padding: "8px 12px",
                        border: "1px solid var(--border-color, #cbd5e1)",
                        borderRadius: "6px",
                        height: "36px",
                        fontSize: "15px",
                        fontWeight: "bold",
                        backgroundColor: "transparent",
                        color: "inherit",
                        cursor: "pointer"
                      }}
                    >
                      {[10, 20, 30, 40, 50, 100].map((num) => (
                        <option key={num} value={num} disabled={product.stock > 0 && num > product.stock}>
                          {num} copies
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="qty-box" style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "16px 0" }}>
                    <button type="button" className="qty-btn" onClick={() => setQty(Number(qty || 1) > 1 ? Number(qty || 1) - 1 : 1)}>-</button>
                    <input
                      type="number"
                      className="qty-input"
                      value={qty}
                      min="1"
                      max={product.stock || 100}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          setQty("");
                        } else {
                          const num = parseInt(val, 10);
                          if (!isNaN(num)) {
                            setQty(Math.max(1, Math.min(product.stock || 100, num)));
                          }
                        }
                      }}
                      onBlur={() => {
                        const num = parseInt(qty, 10);
                        if (qty === "" || isNaN(num) || num < 1) {
                          setQty(1);
                        }
                      }}
                      style={{
                        width: "60px",
                        textAlign: "center",
                        border: "1px solid var(--border-color, #cbd5e1)",
                        borderRadius: "6px",
                        height: "36px",
                        fontSize: "15px",
                        fontWeight: "bold",
                        margin: "0 8px",
                        backgroundColor: "transparent",
                        color: "inherit"
                      }}
                    />
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => setQty(Number(qty || 1) < (product.stock || 100) ? Number(qty || 1) + 1 : Number(qty || 1))}
                    >+</button>
                  </div>
                )}

                <button
                  className="add-cart-btn"
                  disabled={product.stock === 0 || (hasPurchasedWebVersion && !purchaseAsGift)}
                  onClick={() => addToCart(product, qty)}
                >
                  {product.stock === 0 ? "Out of Stock" : "Add to Cart"}
                </button>
                <button
                  className="buy-now-btn"
                  disabled={product.stock === 0 || (hasPurchasedWebVersion && !purchaseAsGift)}
                  onClick={handleBuyNow}
                >
                  {product.stock === 0 ? "Out of Stock" : "Buy Now"}
                </button>

                {product.stock > 0 && (
                  <div style={{ marginTop: "14px", borderTop: "1px solid var(--border-color, #cbd5e1)", paddingTop: "12px", textAlign: "center" }}>
                    <p style={{ margin: "0 0 8px", fontSize: "12.5px", color: "var(--site-text-soft)" }}>
                      Planning to purchase in bulk for a school, class, or institution?
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkQty(qty || 20);
                        setShowBulkModal(true);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        fontSize: "13px",
                        fontWeight: "600",
                        color: "#2563eb",
                        background: "none",
                        cursor: "pointer",
                        padding: "6px 12px",
                        border: "1px dashed #2563eb",
                        borderRadius: "6px",
                        transition: "all 0.15s ease",
                        width: "100%"
                      }}
                      className="bulk-quote-btn"
                    >
                      ✉ Request Bulk / Wholesale Quote
                    </button>
                  </div>
                )}
              </>
            )}


            {/* <p className="secure-line">Secure transaction</p> */}
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

        {reviews.length > 0 ? (
          <>
            {reviews.map((r, index) => (
              <div key={index} className="review-card">
                <strong>{r.user}</strong>
                <p>{renderStars(r.rating)}</p>
                <p>{r.comment}</p>
              </div>
            ))}
            {hasMoreReviews && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "16px" }}>
                <button
                  type="button"
                  className="load-more-btn"
                  disabled={isLoadingMoreReviews}
                  onClick={handleLoadMoreReviews}
                >
                  {isLoadingMoreReviews ? "Loading..." : "Load More Reviews"}
                </button>
              </div>
            )}
          </>
        ) : (
          <p>No reviews yet</p>
        )}

        {/* ── Fix #8: Gate review form — show login prompt for guests ── */}
        <div className="review-form">
          <h4>Add Review</h4>
          {user ? (
            <>
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
                onChange={(e) => { setComment(e.target.value); setReviewError(""); }}
                rows={3}
                placeholder="Write your review..."
              />
              {reviewError && <p className="review-form-error">{reviewError}</p>}
              <button className="add-cart-btn" onClick={submitReview}>
                Submit Review
              </button>
            </>
          ) : (
            <div className="review-login-prompt">
              <p>You must be signed in to leave a review.</p>
              <Link to="/login" className="buy-now-btn review-login-btn">Sign in to review</Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Fix #7: Link > button → Link with button styling ── */}
      <div className="related-section">
        <h3>Related Products</h3>
        <div className="related-products">
          {managedRelatedProducts.length > 0 ? (
            managedRelatedProducts.map((p) => (
              <div key={p._id} className="related-card">
                <div className="related-card-img-wrapper">
                  <img
                    src={p.image || "/no-image.webp"}
                    alt={p.name}
                    width="200"
                    height="200"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <h4>{p.name}</h4>
                <p className="related-card-price">{formatResolvedPrice(getProductPriceDetails(p, selectedAddress?.country))}</p>
                <Link to={`/product/${p._id}`} className="view-btn">View Product</Link>
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
                <div className="related-card-img-wrapper">
                  <img
                    src={p.image || "/no-image.webp"}
                    alt={p.name}
                    width="200"
                    height="200"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <h4>{p.name}</h4>
                <p className="related-card-price">{formatResolvedPrice(getProductPriceDetails(p, selectedAddress?.country))}</p>
                <Link to={`/product/${p._id}`} className="view-btn">View Product</Link>
              </div>
            ))
          ) : (
            <p className="related-empty">No related products found.</p>
          )}
        </div>
      </div>
      {/* ── Wholesale / Bulk Enquiry Modal Overlay ── */}
      {showBulkModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "20px"
        }}>
          <div style={{
            backgroundColor: "var(--site-bg-card, #ffffff)",
            color: "var(--site-text, #1e293b)",
            border: "1px solid var(--border-color, #cbd5e1)",
            borderRadius: "12px",
            width: "100%",
            maxWidth: "500px",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
            overflow: "hidden",
            position: "relative",
            animation: "modalFadeIn 0.2s ease"
          }}>
            <div style={{
              padding: "18px 24px",
              borderBottom: "1px solid var(--border-color, #cbd5e1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "var(--site-bg, #f8fafc)"
            }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Request Wholesale / Bulk Quote</h3>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontSize: "20px",
                  color: "var(--site-text-soft, #64748b)",
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleBulkSubmit} style={{ padding: "24px" }}>
              {bulkSuccess ? (
                <div style={{
                  textAlign: "center",
                  padding: "16px 0",
                  color: "#16a34a"
                }}>
                  <span style={{ fontSize: "40px" }}>✅</span>
                  <h4 style={{ margin: "12px 0 6px", fontSize: "16px" }}>Enquiry Submitted Successfully!</h4>
                  <p style={{ margin: 0, fontSize: "13.5px", color: "var(--site-text-soft)" }}>
                    We have logged your wholesale enquiry. Our administrative team will get back to you with custom rates within 24 hours.
                  </p>
                </div>
              ) : (
                <>
                  <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--site-text-soft)" }}>
                    Interested in bulk copies of <strong>{product.name}</strong>? Submitting this form alerts our team to contact you with wholesale pricing.
                  </p>

                  {bulkError && (
                    <div style={{
                      backgroundColor: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "6px",
                      padding: "10px",
                      color: "#991b1b",
                      fontSize: "13px",
                      marginBottom: "14px"
                    }}>
                      ⚠️ {bulkError}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Name <span style={{ color: "#dc2626" }}>*</span></label>
                      <input
                        type="text"
                        required
                        value={bulkName}
                        onChange={(e) => setBulkName(e.target.value)}
                        placeholder="Your Name"
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid var(--border-color, #cbd5e1)",
                          borderRadius: "6px",
                          fontSize: "13.5px",
                          backgroundColor: "transparent",
                          color: "inherit"
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Email <span style={{ color: "#dc2626" }}>*</span></label>
                      <input
                        type="email"
                        required
                        value={bulkEmail}
                        onChange={(e) => setBulkEmail(e.target.value)}
                        placeholder="your@email.com"
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid var(--border-color, #cbd5e1)",
                          borderRadius: "6px",
                          fontSize: "13.5px",
                          backgroundColor: "transparent",
                          color: "inherit"
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Phone</label>
                      <input
                        type="tel"
                        value={bulkPhone}
                        onChange={(e) => setBulkPhone(e.target.value)}
                        placeholder="Phone number"
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid var(--border-color, #cbd5e1)",
                          borderRadius: "6px",
                          fontSize: "13.5px",
                          backgroundColor: "transparent",
                          color: "inherit"
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Quantity Needed <span style={{ color: "#dc2626" }}>*</span></label>
                      <input
                        type="number"
                        required
                        min="5"
                        value={bulkQty}
                        onChange={(e) => setBulkQty(Math.max(1, parseInt(e.target.value) || ""))}
                        placeholder="Quantity (e.g. 20)"
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid var(--border-color, #cbd5e1)",
                          borderRadius: "6px",
                          fontSize: "13.5px",
                          backgroundColor: "transparent",
                          color: "inherit"
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Institution / School Name</label>
                    <input
                      type="text"
                      value={bulkInst}
                      onChange={(e) => setBulkInst(e.target.value)}
                      placeholder="e.g. Sanskrit Academy / Public School"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid var(--border-color, #cbd5e1)",
                        borderRadius: "6px",
                        fontSize: "13.5px",
                        backgroundColor: "transparent",
                        color: "inherit"
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Special Requirements / Message</label>
                    <textarea
                      value={bulkMsg}
                      onChange={(e) => setBulkMsg(e.target.value)}
                      rows={3}
                      placeholder="Specify if you require bulk shipping outside India, custom print format, or specific delivery timelines."
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid var(--border-color, #cbd5e1)",
                        borderRadius: "6px",
                        fontSize: "13.5px",
                        backgroundColor: "transparent",
                        color: "inherit",
                        resize: "none"
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => setShowBulkModal(false)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color, #cbd5e1)",
                        background: "transparent",
                        fontSize: "13.5px",
                        cursor: "pointer",
                        color: "inherit"
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={bulkSubmitting}
                      style={{
                        padding: "8px 20px",
                        borderRadius: "6px",
                        border: "none",
                        backgroundColor: "#2563eb",
                        color: "#fff",
                        fontSize: "13.5px",
                        fontWeight: "600",
                        cursor: "pointer"
                      }}
                    >
                      {bulkSubmitting ? "Submitting..." : "Submit Enquiry"}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Product;
