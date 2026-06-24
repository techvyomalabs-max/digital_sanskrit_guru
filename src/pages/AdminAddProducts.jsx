import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import { COUNTRY_OPTIONS } from "../utils/countryOptions";
import { formatDate, formatTime } from "../utils/date";
import "./AdminShared.css";
import "./AdminAddProducts.css";

const DEFAULT_CATEGORY_OPTIONS = [
  "General",
  "Dharma",
  "Grammar",
  "Scriptures",
  "Gita",
  "Chanting",
  "Sanskrit",
  "Books"
];

function createEmptyHeroBanner() {
  return { image: "", productId: "" };
}

function createEmptyBundleItem() {
  return { productId: "", quantity: "1" };
}

function createEmptyCountryPrice() {
  return { country: "", price: "" };
}

function createEmptyMarketPrice() {
  return { market: "", regularPrice: "", salePrice: "", startDate: "", endDate: "" };
}

function hasNumericInput(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function hasAnyMarketPriceInput(item) {
  return Boolean(
    String(item?.market || "").trim() ||
      hasNumericInput(item?.regularPrice) ||
      hasNumericInput(item?.salePrice) ||
      String(item?.startDate || "").trim() ||
      String(item?.endDate || "").trim()
  );
}

function createEmptyRelatedProduct() {
  return { productId: "" };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    if (!String(src || "").startsWith("data:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not process image."));
    image.src = src;
  });
}

async function optimizeImageSource(source, { maxWidth, maxHeight, quality = 0.82 } = {}) {
  const image = await loadImageElement(source);
  const safeMaxWidth = Math.max(1, Number(maxWidth || image.width || 1));
  const safeMaxHeight = Math.max(1, Number(maxHeight || image.height || 1));
  const scale = Math.min(safeMaxWidth / image.width, safeMaxHeight / image.height, 1);
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return source;
  }

  try {
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    throw new Error("This image source does not allow optimization.");
  }
}

async function optimizeImageFile(file, options) {
  const source = await readFileAsDataUrl(file);
  return optimizeImageSource(source, options);
}

async function optimizeHeroBannerFile(file) {
  return optimizeImageFile(file, {
    maxWidth: 1600,
    maxHeight: 700,
    quality: 0.82
  });
}

function AdminAddProducts() {
  const { token } = useAuth();
  const formSectionRef = useRef(null);
  const nameInputRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [internationalPrice, setInternationalPrice] = useState("");
  const [internationalCountryPrices, setInternationalCountryPrices] = useState([createEmptyCountryPrice()]);
  const [marketPrices, setMarketPrices] = useState([createEmptyMarketPrice()]);
  const [image, setImage] = useState("");
  const [imagesInput, setImagesInput] = useState("");
  const [trailerVideoUrl, setTrailerVideoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [aboutProduct, setAboutProduct] = useState("");
  const [festiveOffer, setFestiveOffer] = useState(false);
  const [festiveDiscountPercent, setFestiveDiscountPercent] = useState("0");
  const [productType, setProductType] = useState("single");
  const [bundleItems, setBundleItems] = useState([createEmptyBundleItem()]);
  const [relatedProductItems, setRelatedProductItems] = useState([createEmptyRelatedProduct()]);
  const [category, setCategory] = useState("General");
  const [categoryOptions, setCategoryOptions] = useState(DEFAULT_CATEGORY_OPTIONS);
  const [pricingMarkets, setPricingMarkets] = useState([]);
  const [newCategory, setNewCategory] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [categoryMessage, setCategoryMessage] = useState("");
  const [stock, setStock] = useState("1");
  const [editingProduct, setEditingProduct] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [heroBanners, setHeroBanners] = useState([createEmptyHeroBanner()]);
  const [activeHeroBannerIndex, setActiveHeroBannerIndex] = useState(0);
  const [isSavingHeroBanner, setIsSavingHeroBanner] = useState(false);
  const [isUploadingHeroBanners, setIsUploadingHeroBanners] = useState(false);
  const [isUploadingProductImages, setIsUploadingProductImages] = useState(false);
  const [isOptimizingStoredImages, setIsOptimizingStoredImages] = useState(false);
  const [heroBannerMessage, setHeroBannerMessage] = useState("");
  const imagePreview = image.trim() || "https://picsum.photos/120";
  const imagePreviews = imagesInput
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);

  useEffect(() => {
    let active = true;

    axios
      .get("/api/settings")
      .then((res) => {
        if (!active) return;
        const nextCategories = Array.isArray(res.data?.productCategories) && res.data.productCategories.length > 0
          ? res.data.productCategories
          : DEFAULT_CATEGORY_OPTIONS;
        setCategoryOptions(nextCategories);
        setPricingMarkets(Array.isArray(res.data?.pricingMarkets) ? res.data.pricingMarkets : []);
        const nextHeroBanners =
          Array.isArray(res.data?.heroBanners) && res.data.heroBanners.length > 0
            ? res.data.heroBanners.map((item) => ({
                image: String(item?.image || "").trim(),
                productId: String(item?.productId || "").trim()
              }))
            : [
                {
                  image: String(res.data?.heroBannerImage || "").trim(),
                  productId: String(res.data?.heroBannerProductId || "").trim()
                }
              ].filter((item) => item.image);
        setHeroBanners(nextHeroBanners.length > 0 ? nextHeroBanners : [createEmptyHeroBanner()]);
        setActiveHeroBannerIndex(0);
      })
      .catch(() => {
        if (!active) return;
        setCategoryOptions(DEFAULT_CATEGORY_OPTIONS);
        setPricingMarkets([]);
        setHeroBanners([createEmptyHeroBanner()]);
        setActiveHeroBannerIndex(0);
      });

    setIsLoadingProducts(true);
    axios
      .get("/api/products")
      .then((res) => {
        if (!active) return;
        setProducts(res.data);
      })
      .catch(() => {
        if (!active) return;
        setProducts([]);
      })
      .finally(() => {
        if (!active) return;
        setIsLoadingProducts(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const saveCategoryOptions = async (nextCategories) => {
    const { data: currentSettings } = await axios.get("/api/settings");
    const payload = {
      gstPercent: currentSettings?.gstPercent ?? 0,
      deliveryCharge: currentSettings?.deliveryCharge ?? 0,
      siteTheme: currentSettings?.siteTheme,
      customThemes: currentSettings?.customThemes || [],
      productCategories: nextCategories,
      pricingMarkets: currentSettings?.pricingMarkets || [],
      heroBanners: currentSettings?.heroBanners || []
    };

    const { data } = await axios.put("/api/settings", payload, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const normalized = Array.isArray(data?.productCategories) && data.productCategories.length > 0
      ? data.productCategories
      : DEFAULT_CATEGORY_OPTIONS;
    setCategoryOptions(normalized);
    return normalized;
  };

  const loadProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const res = await axios.get("/api/products");
      setProducts(res.data);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const activeHeroBanner = heroBanners[activeHeroBannerIndex] || createEmptyHeroBanner();
  const availableBundleProducts = useMemo(() => {
    const editingId = String(editingProduct?._id || "");
    return products.filter((product) => String(product?._id || "") !== editingId);
  }, [products, editingProduct]);

  const selectedBundleProducts = useMemo(() => {
    return bundleItems
      .map((item) => {
        const matchedProduct = availableBundleProducts.find(
          (product) => String(product?._id || "") === String(item.productId || "")
        );
        if (!matchedProduct) return null;
        return {
          ...matchedProduct,
          quantity: Math.max(1, Number(item.quantity || 1))
        };
      })
      .filter(Boolean);
  }, [availableBundleProducts, bundleItems]);

  const selectedRelatedProducts = useMemo(() => {
    return relatedProductItems
      .map((item) =>
        availableBundleProducts.find((product) => String(product?._id || "") === String(item.productId || "")) || null
      )
      .filter(Boolean);
  }, [availableBundleProducts, relatedProductItems]);

  const calculatedBundlePrice = useMemo(() => {
    return selectedBundleProducts.reduce(
      (sum, product) => sum + Number(product?.price || 0) * Math.max(1, Number(product?.quantity || 1)),
      0
    );
  }, [selectedBundleProducts]);

  const selectedHeroProduct = useMemo(() => {
    return products.find((product) => product?._id === activeHeroBanner.productId) || null;
  }, [products, activeHeroBanner]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const base = [...products].sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
    if (!query) return base;

    return base.filter((product) => {
      const values = [
        String(product?.name || ""),
        String(product?.category || ""),
        String(product?.description || "")
      ]
        .join(" ")
        .toLowerCase();
      return values.includes(query);
    });
  }, [products, searchQuery]);

  const formSummary = useMemo(() => {
    const normalizedName = name.trim();
    const numericPrice = productType === "bundle" ? Number(calculatedBundlePrice || 0) : Number(price);
    const numericStock = Number(stock);
    const primaryImage = image.trim();

    return {
      isNameValid: normalizedName.length > 0,
      isPriceValid: !Number.isNaN(numericPrice) && numericPrice > 0,
      isStockValid: !Number.isNaN(numericStock) && numericStock >= 0,
      hasPrimaryImage: primaryImage.length > 0,
      isValid:
        normalizedName.length > 0 &&
        !Number.isNaN(numericPrice) &&
        numericPrice > 0 &&
        !Number.isNaN(numericStock) &&
        numericStock >= 0 &&
        primaryImage.length > 0,
      normalizedName,
      numericPrice,
      numericStock
    };
  }, [calculatedBundlePrice, image, name, price, productType, stock]);

  const productComposerStats = useMemo(() => {
    const extraImageCount = imagesInput
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean).length;

    const aboutPointCount = aboutProduct
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean).length;

    const countryOverrideCount = internationalCountryPrices.filter(
      (item) => String(item?.country || "").trim() && String(item?.price || "").trim()
    ).length;
    const marketPriceCount = marketPrices.filter(
      (item) => String(item?.market || "").trim() && String(item?.regularPrice || "").trim()
    ).length;

    const relatedCount = relatedProductItems.filter((item) => String(item?.productId || "").trim()).length;

    return {
      extraImageCount,
      aboutPointCount,
      countryOverrideCount,
      marketPriceCount,
      relatedCount
    };
  }, [aboutProduct, imagesInput, internationalCountryPrices, marketPrices, relatedProductItems]);

  const resetForm = () => {
    setName("");
    setPrice("");
    setInternationalPrice("");
    setInternationalCountryPrices([createEmptyCountryPrice()]);
    setMarketPrices([createEmptyMarketPrice()]);
    setImage("");
    setImagesInput("");
    setTrailerVideoUrl("");
    setDescription("");
    setAboutProduct("");
    setFestiveOffer(false);
    setFestiveDiscountPercent("0");
    setProductType("single");
    setBundleItems([createEmptyBundleItem()]);
    setRelatedProductItems([createEmptyRelatedProduct()]);
    setCategory("General");
    setStock("1");
    setEditingProduct(null);
  };

  const saveHeroBanner = async () => {
    setIsSavingHeroBanner(true);
    setHeroBannerMessage("");

    try {
      const nextHeroBanners = heroBanners
        .map((item) => ({
          image: String(item?.image || "").trim(),
          productId: String(item?.productId || "").trim()
        }))
        .filter((item) => item.image);

      const res = await axios.put(
        "/api/settings",
        { heroBanners: nextHeroBanners },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const savedHeroBanners =
        Array.isArray(res.data?.heroBanners) && res.data.heroBanners.length > 0
          ? res.data.heroBanners.map((item) => ({
              image: String(item?.image || "").trim(),
              productId: String(item?.productId || "").trim()
            }))
          : [createEmptyHeroBanner()];
      setHeroBanners(savedHeroBanners);
      setActiveHeroBannerIndex((current) => Math.min(current, savedHeroBanners.length - 1));
      setHeroBannerMessage("Hero banners updated.");
    } catch (err) {
      setHeroBannerMessage(err?.response?.data?.message || "Could not save hero banners.");
    } finally {
      setIsSavingHeroBanner(false);
    }
  };

  const updateHeroBanner = (index, field, value) => {
    setHeroBanners((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    );
  };

  const addHeroBanner = () => {
    setHeroBanners((current) => {
      const next = [...current, createEmptyHeroBanner()];
      setActiveHeroBannerIndex(next.length - 1);
      return next;
    });
    setHeroBannerMessage("");
  };

  const removeHeroBanner = (index) => {
    setHeroBanners((current) => {
      if (current.length === 1) return [createEmptyHeroBanner()];
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    setActiveHeroBannerIndex((current) => (current > index ? current - 1 : Math.max(0, current === index ? current - 1 : current)));
    setHeroBannerMessage("");
  };

  const handleHeroBannerFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsUploadingHeroBanners(true);
    setHeroBannerMessage("");

    try {
      const imageFiles = files.filter((file) => String(file.type || "").startsWith("image/"));
      if (imageFiles.length === 0) {
        setHeroBannerMessage("Please choose image files only.");
        return;
      }

      const uploadedBanners = await Promise.all(
        imageFiles.slice(0, 10).map(async (file) => ({
          image: await optimizeHeroBannerFile(file),
          productId: ""
        }))
      );

      setHeroBanners((current) => {
        const existingConfigured = current.filter((item) => String(item?.image || "").trim());
        const next = [...existingConfigured, ...uploadedBanners].slice(0, 10);
        const finalList = next.length > 0 ? next : [createEmptyHeroBanner()];
        setActiveHeroBannerIndex(Math.max(0, finalList.length - 1));
        return finalList;
      });

      setHeroBannerMessage(`${uploadedBanners.length} banner image${uploadedBanners.length === 1 ? "" : "s"} added. Save hero banners to publish them.`);
    } catch {
      setHeroBannerMessage("Could not upload banner images.");
    } finally {
      setIsUploadingHeroBanners(false);
      event.target.value = "";
    }
  };

  const handlePrimaryImageFileUpload = async (event) => {
    const [file] = Array.from(event.target.files || []);
    if (!file) return;

    setIsUploadingProductImages(true);
    setFormMessage("");

    try {
      if (!String(file.type || "").startsWith("image/")) {
        setFormMessage("Please choose an image file for the primary product image.");
        return;
      }

      const optimizedImage = await optimizeImageFile(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8
      });
      setImage(optimizedImage);
      setFormMessage("Primary product image optimized and attached.");
    } catch {
      setFormMessage("Could not process the primary product image.");
    } finally {
      setIsUploadingProductImages(false);
      event.target.value = "";
    }
  };

  const handleGalleryImageFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsUploadingProductImages(true);
    setFormMessage("");

    try {
      const imageFiles = files.filter((file) => String(file.type || "").startsWith("image/"));
      if (imageFiles.length === 0) {
        setFormMessage("Please choose image files only for the gallery.");
        return;
      }

      const optimizedImages = await Promise.all(
        imageFiles.slice(0, 8).map((file) =>
          optimizeImageFile(file, {
            maxWidth: 1200,
            maxHeight: 1200,
            quality: 0.78
          })
        )
      );

      setImagesInput((current) => {
        const existing = current
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean);
        return [...existing, ...optimizedImages].slice(0, 8).join("\n");
      });
      setFormMessage(
        `${optimizedImages.length} gallery image${optimizedImages.length === 1 ? "" : "s"} optimized and added.`
      );
    } catch {
      setFormMessage("Could not process the gallery images.");
    } finally {
      setIsUploadingProductImages(false);
      event.target.value = "";
    }
  };

  const handleOptimizeStoredImages = async () => {
    if (isOptimizingStoredImages) return;

    setIsOptimizingStoredImages(true);
    setFormMessage("");
    setHeroBannerMessage("");

    let updatedProductsCount = 0;
    let updatedBannerCount = 0;
    let skippedCount = 0;

    try {
      const optimizedHeroBanners = [];

      for (const banner of heroBanners) {
        const source = String(banner?.image || "").trim();
        if (!source) {
          optimizedHeroBanners.push(banner);
          continue;
        }

        try {
          const optimizedImage = await optimizeImageSource(source, {
            maxWidth: 1600,
            maxHeight: 700,
            quality: 0.82
          });
          if (optimizedImage !== source) {
            updatedBannerCount += 1;
          }
          optimizedHeroBanners.push({
            ...banner,
            image: optimizedImage
          });
        } catch {
          skippedCount += 1;
          optimizedHeroBanners.push(banner);
        }
      }

      if (updatedBannerCount > 0) {
        const { data } = await axios.put(
          "/api/settings",
          {
            heroBanners: optimizedHeroBanners.map((item) => ({
              image: String(item?.image || "").trim(),
              productId: String(item?.productId || "").trim()
            }))
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const savedHeroBanners =
          Array.isArray(data?.heroBanners) && data.heroBanners.length > 0
            ? data.heroBanners.map((item) => ({
                image: String(item?.image || "").trim(),
                productId: String(item?.productId || "").trim()
              }))
            : [createEmptyHeroBanner()];
        setHeroBanners(savedHeroBanners);
      }

      for (const product of products) {
        const primaryImage = String(product?.image || "").trim();
        const existingImages = Array.isArray(product?.images)
          ? product.images.map((item) => String(item || "").trim()).filter(Boolean)
          : primaryImage
            ? [primaryImage]
            : [];

        if (existingImages.length === 0) continue;

        const optimizedImages = [];
        let productChanged = false;

        for (const imageSource of existingImages) {
          try {
            const optimizedImage = await optimizeImageSource(imageSource, {
              maxWidth: 1200,
              maxHeight: 1200,
              quality: 0.8
            });
            optimizedImages.push(optimizedImage);
            if (optimizedImage !== imageSource) {
              productChanged = true;
            }
          } catch {
            skippedCount += 1;
            optimizedImages.push(imageSource);
          }
        }

        if (!productChanged) continue;

        await axios.put(
          `/api/products/${product._id}`,
          {
            image: optimizedImages[0] || primaryImage,
            images: optimizedImages
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        updatedProductsCount += 1;
      }

      if (updatedProductsCount > 0) {
        await loadProducts();
      }

      const messageParts = [];
      if (updatedProductsCount > 0) {
        messageParts.push(`${updatedProductsCount} product${updatedProductsCount === 1 ? "" : "s"} optimized`);
      }
      if (updatedBannerCount > 0) {
        messageParts.push(`${updatedBannerCount} banner${updatedBannerCount === 1 ? "" : "s"} optimized`);
      }
      if (skippedCount > 0) {
        messageParts.push(`${skippedCount} image${skippedCount === 1 ? "" : "s"} skipped`);
      }

      const summary = messageParts.length > 0
        ? `${messageParts.join(", ")}.`
        : "No existing images needed optimization.";
      setFormMessage(summary);
      setHeroBannerMessage(summary);
    } catch (err) {
      const message = err?.response?.data?.message || "Could not optimize existing stored images.";
      setFormMessage(message);
      setHeroBannerMessage(message);
    } finally {
      setIsOptimizingStoredImages(false);
    }
  };

  const handleAddCategory = async () => {
    const value = newCategory.trim();
    if (!value) {
      setCategoryMessage("Enter a category name first.");
      return;
    }

    const exists = categoryOptions.some(
      (option) => option.toLowerCase() === value.toLowerCase() && option.toLowerCase() !== editingCategoryName.toLowerCase()
    );
    if (exists) {
      setCategoryMessage("That category already exists.");
      return;
    }

    try {
      if (editingCategoryName) {
        const updated = await saveCategoryOptions(
          categoryOptions.map((option) => (option === editingCategoryName ? value : option))
        );

        const impactedProducts = products.filter(
          (product) => String(product?.category || "").trim().toLowerCase() === editingCategoryName.toLowerCase()
        );

        await Promise.all(
          impactedProducts.map((product) =>
            axios.put(
              `/api/products/${product._id}`,
              { category: value },
              { headers: { Authorization: `Bearer ${token}` } }
            )
          )
        );

        await loadProducts();
        if (category.toLowerCase() === editingCategoryName.toLowerCase()) {
          setCategory(updated.find((option) => option.toLowerCase() === value.toLowerCase()) || value);
        }
        setEditingCategoryName("");
        setCategoryMessage("Category updated successfully.");
      } else {
        const updated = await saveCategoryOptions([...categoryOptions, value]);
        setCategory(updated.find((option) => option.toLowerCase() === value.toLowerCase()) || value);
        setCategoryMessage("Category added successfully.");
      }

      setNewCategory("");
    } catch (err) {
      setCategoryMessage(err?.response?.data?.message || `Could not ${editingCategoryName ? "update" : "add"} category.`);
    }
  };

  const handleStartCategoryEdit = (option) => {
    setEditingCategoryName(option);
    setNewCategory(option);
    setCategory(option);
    setCategoryMessage("");
  };

  const handleCancelCategoryEdit = () => {
    setEditingCategoryName("");
    setNewCategory("");
    setCategoryMessage("");
  };

  const handleDeleteCategory = async () => {
    if (!editingCategoryName) return;

    const confirmed = window.confirm(
      `Delete the category "${editingCategoryName}"?\n\nAll products currently in this category will be moved to "General".`
    );
    if (!confirmed) return;

    try {
      // Remove from list; keep all others
      const nextCategories = categoryOptions.filter((opt) => opt !== editingCategoryName);
      // Ensure "General" always exists as fallback
      if (!nextCategories.includes("General")) nextCategories.unshift("General");

      await saveCategoryOptions(nextCategories);

      // Move affected products to "General"
      const affected = products.filter(
        (p) => String(p?.category || "").trim().toLowerCase() === editingCategoryName.toLowerCase()
      );
      await Promise.all(
        affected.map((p) =>
          axios.put(`/api/products/${p._id}`, { category: "General" }, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );

      if (affected.length > 0) await loadProducts();

      // If current form was using deleted category, reset to General
      if (category.toLowerCase() === editingCategoryName.toLowerCase()) {
        setCategory("General");
      }

      setEditingCategoryName("");
      setNewCategory("");
      setCategoryMessage(
        `Category "${editingCategoryName}" deleted.${affected.length > 0 ? ` ${affected.length} product${affected.length === 1 ? "" : "s"} moved to "General".` : ""}`
      );
    } catch (err) {
      setCategoryMessage(err?.response?.data?.message || "Could not delete category.");
    }
  };

  const saveProduct = async () => {
    if (!formSummary.isValid) {
      setFormMessage("Complete name, price, stock, and primary image before saving.");
      return;
    }

    if (productType === "bundle" && selectedBundleProducts.length === 0) {
      setFormMessage("Select at least one existing product for the bundle.");
      return;
    }

    const hasIncompleteMarketPriceRow = marketPrices.some((item) => {
      if (!hasAnyMarketPriceInput(item)) return false;
      return !String(item?.market || "").trim() || !hasNumericInput(item?.regularPrice);
    });

    if (hasIncompleteMarketPriceRow) {
      setFormMessage("Complete each Market Pricing row with both market and regular price, or remove the unfinished row.");
      return;
    }

    const payload = {
      name: formSummary.normalizedName,
      price: formSummary.numericPrice,
      internationalPrice: internationalPrice.trim() === "" ? null : Math.max(0, Number(internationalPrice || 0)),
      internationalCountryPrices: internationalCountryPrices
        .map((item) => ({
          country: String(item?.country || "").trim(),
          price: Math.max(0, Number(item?.price || 0))
        }))
        .filter((item) => item.country && !Number.isNaN(item.price)),
      marketPrices: marketPrices
        .map((item) => ({
          market: String(item?.market || "").trim(),
          regularPrice: hasNumericInput(item?.regularPrice) ? Math.max(0, Number(item.regularPrice)) : null,
          salePrice:
            !hasNumericInput(item?.salePrice)
              ? null
              : Math.max(0, Number(item.salePrice)),
          startDate: String(item?.startDate || "").trim() || null,
          endDate: String(item?.endDate || "").trim() || null
        }))
        .filter((item) => item.market && item.regularPrice !== null && !Number.isNaN(item.regularPrice)),
      image: image.trim(),
      images: imagesInput,
      trailerVideoUrl: trailerVideoUrl.trim(),
      description: description.trim(),
      aboutProduct,
      festiveOffer,
      festiveDiscountPercent: festiveOffer ? Math.min(95, Math.max(0, Number(festiveDiscountPercent || 0))) : 0,
      productType,
      bundleItems:
        productType === "bundle"
          ? bundleItems
              .map((item) => ({
                productId: String(item.productId || "").trim(),
                quantity: Math.max(1, Number(item.quantity || 1))
              }))
              .filter((item) => item.productId)
          : [],
      relatedProducts: relatedProductItems
        .map((item) => ({
          productId: String(item.productId || "").trim()
        }))
        .filter((item) => item.productId),
      category: category.trim() || "General",
      stock: formSummary.numericStock
    };

    setIsSavingProduct(true);
    setFormMessage("");

    try {
      let savedProduct;
      if (editingProduct?._id) {
        const { data } = await axios.put(`/api/products/${editingProduct._id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        savedProduct = data;
        setFormMessage(
          `Product updated successfully.${Array.isArray(data?.internationalCountryPrices) && data.internationalCountryPrices.length > 0
            ? ` Saved ${data.internationalCountryPrices.length} country override${data.internationalCountryPrices.length === 1 ? "" : "s"}.`
            : ""}`
        );
      } else {
        const { data } = await axios.post("/api/products", payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        savedProduct = data;
        setFormMessage(
          `Product added successfully.${Array.isArray(data?.internationalCountryPrices) && data.internationalCountryPrices.length > 0
            ? ` Saved ${data.internationalCountryPrices.length} country override${data.internationalCountryPrices.length === 1 ? "" : "s"}.`
            : ""}`
        );
      }

      await loadProducts();
      resetForm();
    } catch (err) {
      setFormMessage(err?.response?.data?.message || "Could not save product. Try again.");
    } finally {
      setIsSavingProduct(false);
    }
  };

  const startEdit = (product) => {
    setEditingProduct(product);
    setName(product.name || "");
    setPrice(String(product.price ?? ""));
    setInternationalPrice(
      product.internationalPrice === null || product.internationalPrice === undefined ? "" : String(product.internationalPrice)
    );
    setInternationalCountryPrices(
      Array.isArray(product.internationalCountryPrices) && product.internationalCountryPrices.length > 0
        ? product.internationalCountryPrices.map((item) => ({
            country: String(item?.country || ""),
            price: String(item?.price ?? "")
          }))
        : [createEmptyCountryPrice()]
    );
    setMarketPrices(
      Array.isArray(product.marketPrices) && product.marketPrices.length > 0
        ? product.marketPrices.map((item) => ({
            market: String(item?.market || ""),
            regularPrice: String(item?.regularPrice ?? ""),
            salePrice:
              item?.salePrice === null || item?.salePrice === undefined ? "" : String(item?.salePrice ?? ""),
            startDate: item?.startDate ? String(item.startDate).slice(0, 10) : "",
            endDate: item?.endDate ? String(item.endDate).slice(0, 10) : ""
          }))
        : [createEmptyMarketPrice()]
    );
    setImage(product.image || "");
    setImagesInput(Array.isArray(product.images) && product.images.length > 0 ? product.images.join("\n") : product.image || "");
    setTrailerVideoUrl(String(product.trailerVideoUrl || ""));
    setDescription(product.description || "");
    setAboutProduct(Array.isArray(product.aboutProduct) ? product.aboutProduct.join("\n") : "");
    setFestiveOffer(product.festiveOffer === true);
    setFestiveDiscountPercent(String(Number(product.festiveDiscountPercent || 0)));
    setProductType(String(product.productType || "single") === "bundle" ? "bundle" : "single");
    setBundleItems(
      Array.isArray(product.bundleItems) && product.bundleItems.length > 0
        ? product.bundleItems.map((item) => ({
            productId: String(item?.product?._id || item?.product || ""),
            quantity: String(Math.max(1, Number(item?.quantity || 1)))
          }))
        : [createEmptyBundleItem()]
    );
    setRelatedProductItems(
      Array.isArray(product.relatedProducts) && product.relatedProducts.length > 0
        ? product.relatedProducts.map((item) => ({
            productId: String(item?._id || item?.productId || item?.id || item || "")
          }))
        : [createEmptyRelatedProduct()]
    );
    setCategory(product.category || "General");
    setStock(String(product.stock ?? 1));
    setFormMessage("");

    requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      nameInputRef.current?.focus();
    });
  };

  const deleteProduct = async (id) => {
    const shouldDelete = window.confirm("Delete this product? This action cannot be undone.");
    if (!shouldDelete) return;

    await axios.delete(`/api/products/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    loadProducts();
  };

  const parseCsvLine = (line) => {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === "\"") {
        const escapedQuote = inQuotes && line[i + 1] === "\"";
        if (escapedQuote) {
          current += "\"";
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }

    values.push(current.trim());
    return values;
  };

  const parseCsv = (text) => {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    return lines.slice(1).map((line) => {
      const cols = parseCsvLine(line);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] ?? "";
      });
      return row;
    });
  };

  const normalizeUploadProduct = (item) => {
    const productName = String(item?.name || "").trim();
    const productPrice = Number(item?.price);
    const rawInternationalPrice = item?.internationalPrice ?? item?.internationalprice;
    const parsedInternationalPrice = Number(rawInternationalPrice);
    const rawCountryPrices = item?.internationalCountryPrices ?? item?.internationalcountryprices;
    const rawMarketPrices = item?.marketPrices ?? item?.marketprices;
    if (!productName || Number.isNaN(productPrice)) return null;

    let parsedCountryPrices = [];
    if (Array.isArray(rawCountryPrices)) {
      parsedCountryPrices = rawCountryPrices;
    } else if (typeof rawCountryPrices === "string" && rawCountryPrices.trim()) {
      try {
        const parsed = JSON.parse(rawCountryPrices);
        if (Array.isArray(parsed)) {
          parsedCountryPrices = parsed;
        }
      } catch {
        parsedCountryPrices = [];
      }
    }

    let parsedMarketPrices = [];
    if (Array.isArray(rawMarketPrices)) {
      parsedMarketPrices = rawMarketPrices;
    } else if (typeof rawMarketPrices === "string" && rawMarketPrices.trim()) {
      try {
        const parsed = JSON.parse(rawMarketPrices);
        if (Array.isArray(parsed)) {
          parsedMarketPrices = parsed;
        }
      } catch {
        parsedMarketPrices = [];
      }
    }

    return {
      name: productName,
      price: productPrice,
      internationalPrice:
        rawInternationalPrice === null || rawInternationalPrice === undefined || rawInternationalPrice === ""
          ? null
          : (Number.isNaN(parsedInternationalPrice) ? null : Math.max(0, parsedInternationalPrice)),
      internationalCountryPrices: parsedCountryPrices
        .map((entry) => ({
          country: String(entry?.country || "").trim(),
          price: Math.max(0, Number(entry?.price || 0))
        }))
        .filter((entry) => entry.country && !Number.isNaN(entry.price)),
      marketPrices: parsedMarketPrices
        .map((entry) => ({
          market: String(entry?.market || "").trim(),
          regularPrice: Math.max(0, Number(entry?.regularPrice || 0)),
          salePrice:
            entry?.salePrice === null || entry?.salePrice === undefined || String(entry?.salePrice).trim() === ""
              ? null
              : Math.max(0, Number(entry?.salePrice || 0)),
          startDate: String(entry?.startDate || "").trim() || null,
          endDate: String(entry?.endDate || "").trim() || null
        }))
        .filter((entry) => entry.market && !Number.isNaN(entry.regularPrice)),
      image: String(item?.image || "").trim(),
      images: String(item?.images || item?.image || "").trim(),
      description: String(item?.description || "").trim(),
      aboutProduct: String(item?.aboutproduct || item?.about_product || "").trim(),
      category: String(item?.category || "General").trim() || "General",
      stock: Math.max(0, Number(item?.stock) || 0)
    };
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage("");

    try {
      const text = await file.text();
      const isJson = file.name.toLowerCase().endsWith(".json");
      let rows = [];

      if (isJson) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) rows = parsed;
        else if (Array.isArray(parsed?.products)) rows = parsed.products;
      } else {
        rows = parseCsv(text);
      }

      const payloads = rows.map(normalizeUploadProduct).filter(Boolean);
      if (payloads.length === 0) {
        setUploadMessage("No valid products found in file.");
        return;
      }

      const results = await Promise.allSettled(
        payloads.map((payload) =>
          axios.post("/api/products", payload, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );

      const successCount = results.filter((r) => r.status === "fulfilled").length;
      const failedCount = results.length - successCount;
      setUploadMessage(`Upload complete. Added: ${successCount}, Failed: ${failedCount}`);
      await loadProducts();
    } catch {
      setUploadMessage("Upload failed. Please use valid CSV/JSON format.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const updateBundleItem = (index, field, value) => {
    setBundleItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    );
  };

  const addBundleItem = () => {
    setBundleItems((current) => [...current, createEmptyBundleItem()]);
  };

  const removeBundleItem = (index) => {
    setBundleItems((current) => (current.length === 1 ? [createEmptyBundleItem()] : current.filter((_, itemIndex) => itemIndex !== index)));
  };

  const updateRelatedProductItem = (index, value) => {
    setRelatedProductItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, productId: value } : item))
    );
  };

  const addRelatedProductItem = () => {
    setRelatedProductItems((current) => [...current, createEmptyRelatedProduct()]);
  };

  const removeRelatedProductItem = (index) => {
    setRelatedProductItems((current) =>
      current.length === 1 ? [createEmptyRelatedProduct()] : current.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const updateInternationalCountryPrice = (index, field, value) => {
    setInternationalCountryPrices((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    );
  };

  const addInternationalCountryPrice = () => {
    setInternationalCountryPrices((current) => [...current, createEmptyCountryPrice()]);
  };

  const removeInternationalCountryPrice = (index) => {
    setInternationalCountryPrices((current) =>
      current.length === 1 ? [createEmptyCountryPrice()] : current.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const updateMarketPrice = (index, field, value) => {
    setMarketPrices((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    );
  };

  const addMarketPrice = () => {
    setMarketPrices((current) => [...current, createEmptyMarketPrice()]);
  };

  const removeMarketPrice = (index) => {
    setMarketPrices((current) =>
      current.length === 1 ? [createEmptyMarketPrice()] : current.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header">
          <div>
            <h1>Add Products</h1>
            <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--admin-muted)" }}>
              Add one product quickly, or switch into edit mode from the list below.
            </p>
          </div>
        </div>

        <section ref={formSectionRef} className="card add-product-card">
          <div className="add-product-card-header">
            <div>
              <h3>{editingProduct ? "Edit Product" : "Add Product"}</h3>
              <p>
                {editingProduct
                  ? `Updating ${editingProduct.name}. Save when your changes are ready.`
                  : "Fill in the product basics first, then preview the image before saving."}
              </p>
            </div>
            <div className="add-product-status-badges">
              <span className={formSummary.isNameValid ? "status-badge valid" : "status-badge"}>Name</span>
              <span className={formSummary.isPriceValid ? "status-badge valid" : "status-badge"}>Price</span>
              <span className={formSummary.hasPrimaryImage ? "status-badge valid" : "status-badge"}>Image</span>
            </div>
          </div>
          {editingProduct && (
            <div className="edit-mode-banner">
              <strong>Edit mode</strong>
              <span>You are editing an existing product. Cancel to start a fresh product form.</span>
            </div>
          )}
          <div className="product-composer-overview">
            <div className="product-composer-metric">
              <span>About Points</span>
              <strong>{productComposerStats.aboutPointCount}</strong>
            </div>
            <div className="product-composer-metric">
              <span>Extra Images</span>
              <strong>{productComposerStats.extraImageCount}</strong>
            </div>
            <div className="product-composer-metric">
              <span>Country Overrides</span>
              <strong>{productComposerStats.countryOverrideCount}</strong>
            </div>
            <div className="product-composer-metric">
              <span>Market Prices</span>
              <strong>{productComposerStats.marketPriceCount}</strong>
            </div>
            <div className="product-composer-metric">
              <span>Related Products</span>
              <strong>{productComposerStats.relatedCount}</strong>
            </div>
          </div>

          <div className="product-composer-layout">
            <div className="product-composer-main">
              <section className="product-composer-panel">
                <div className="product-composer-panel-head">
                  <div>
                    <h4>Essentials</h4>
                    <p>Set the core product information customers will see first.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="admin-field">
                    <span>Product Name</span>
                    <input
                      ref={nameInputRef}
                      placeholder="e.g. Bhagavad Gita Deluxe Edition"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Product Type</span>
                    <select value={productType} onChange={(e) => setProductType(e.target.value === "bundle" ? "bundle" : "single")}>
                      <option value="single">Single Product</option>
                      <option value="bundle">Bundle</option>
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Price</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 999"
                      value={productType === "bundle" ? String(calculatedBundlePrice || "") : price}
                      onChange={(e) => setPrice(e.target.value)}
                      readOnly={productType === "bundle"}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Stock</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 25"
                      value={stock}
                      onChange={(e) => setStock(e.target.value)}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Festive Offer</span>
                    <select value={festiveOffer ? "yes" : "no"} onChange={(e) => setFestiveOffer(e.target.value === "yes")}>
                      <option value="no">Regular Product</option>
                      <option value="yes">Festive Offer</option>
                    </select>
                  </label>
                  {festiveOffer ? (
                    <label className="admin-field">
                      <span>Festive Discount %</span>
                      <input
                        type="number"
                        min="0"
                        max="95"
                        step="1"
                        placeholder="e.g. 20"
                        value={festiveDiscountPercent}
                        onChange={(e) => setFestiveDiscountPercent(e.target.value)}
                      />
                    </label>
                  ) : null}
                  <div className="admin-field admin-field-wide">
                    <span>Select Product Category</span>
                    <div className="admin-category-manager">
                      <div className="admin-category-select-row">
                        <select value={category} onChange={(e) => setCategory(e.target.value)} className="admin-category-select-dropdown">
                          {categoryOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="admin-category-inline-edit"
                          onClick={() => handleStartCategoryEdit(category || "General")}
                        >
                          Edit Selected
                        </button>
                      </div>
                      <div className="admin-category-compact-meta">
                        <small>
                          {categoryOptions.length} categories available. Selected: <strong>{category || "General"}</strong>
                        </small>
                      </div>

                      <div className="admin-category-manager-actions">
                        <div className="theme-form-row">
                          <input
                            placeholder="e.g. Mobile App Access"
                            value={newCategory}
                            onChange={(e) => {
                              setNewCategory(e.target.value);
                              setCategoryMessage("");
                            }}
                          />
                          <button type="button" onClick={handleAddCategory}>
                            {editingCategoryName ? "Save" : "Add"}
                          </button>
                          {editingCategoryName ? (
                            <>
                              <button type="button" onClick={handleCancelCategoryEdit}>
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="admin-category-delete-btn"
                                onClick={handleDeleteCategory}
                                title={`Delete "${editingCategoryName}" category`}
                              >
                                🗑 Delete
                              </button>
                            </>
                          ) : null}
                        </div>
                        <small className="admin-category-helper">
                          {editingCategoryName
                            ? `Editing "${editingCategoryName}". Saving will rename it everywhere it is used.`
                            : "Need a new category? Add it here and select it immediately."}
                        </small>
                        {categoryMessage ? (
                          <small
                            className={`admin-category-feedback${
                              categoryMessage.includes("successfully") ? " success" : " error"
                            }`}
                          >
                            {categoryMessage}
                          </small>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <label className="admin-field admin-field-wide">
                    <span>Description</span>
                    <textarea
                      placeholder="Add a short, clear product description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </label>
                  <label className="admin-field admin-field-wide">
                    <span>Trailer Video URL</span>
                    <input
                      placeholder="YouTube, Vimeo, or direct MP4 link"
                      value={trailerVideoUrl}
                      onChange={(e) => setTrailerVideoUrl(e.target.value)}
                    />
                  </label>
                  <label className="admin-field admin-field-wide">
                    <span>About This Product</span>
                    <textarea
                      placeholder={"Add one point per line\nExample: Published in Sanskrit\nExample: 848 page edition"}
                      value={aboutProduct}
                      onChange={(e) => setAboutProduct(e.target.value)}
                      rows={5}
                    />
                  </label>
                </div>
              </section>

              <section className="product-composer-panel">
                <div className="product-composer-panel-head">
                  <div>
                    <h4>Pricing</h4>
                    <p>Control domestic pricing, fallback international pricing, country overrides, and market-based pricing.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="admin-field">
                    <span>International Price</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Used for all countries except India"
                      value={internationalPrice}
                      onChange={(e) => setInternationalPrice(e.target.value)}
                    />
                  </label>
                  <div className="admin-field admin-field-wide">
                    <span>Country Specific International Prices</span>
                    <div className="admin-bundle-builder">
                      <div className="admin-bundle-builder-head">
                        <strong>Override the international price for selected countries</strong>
                        <button type="button" onClick={addInternationalCountryPrice}>
                          Add Country Price
                        </button>
                      </div>
                      <div className="admin-bundle-builder-list">
                        {internationalCountryPrices.map((item, index) => (
                          <div key={`intl-country-price-${index}`} className="admin-bundle-builder-row">
                            <select
                              value={item.country}
                              onChange={(e) => updateInternationalCountryPrice(index, "country", e.target.value)}
                            >
                              <option value="">Select country</option>
                              {COUNTRY_OPTIONS.filter((country) => country !== "India").map((country) => (
                                <option key={country} value={country}>
                                  {country}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="0"
                              placeholder="Price"
                              value={item.price}
                              onChange={(e) => updateInternationalCountryPrice(index, "price", e.target.value)}
                            />
                            <button type="button" className="danger" onClick={() => removeInternationalCountryPrice(index)}>
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="admin-bundle-preview">
                        <span>How it works</span>
                        <p>India uses the base price. Matching countries use their own override. All other countries use the fallback international price.</p>
                      </div>
                    </div>
                  </div>
                  <div className="admin-field admin-field-wide">
                    <span>Market Pricing</span>
                    <div className="admin-bundle-builder">
                      <div className="admin-bundle-builder-head">
                        <strong>Set reusable region pricing like North America, Europe, or GCC</strong>
                        <button type="button" onClick={addMarketPrice}>
                          Add Market Price
                        </button>
                      </div>
                      <div className="admin-bundle-builder-list">
                        {marketPrices.map((item, index) => (
                          <div key={`market-price-${index}`} className="admin-bundle-builder-row admin-bundle-builder-row-wrap">
                            <select
                              value={item.market}
                              onChange={(e) => updateMarketPrice(index, "market", e.target.value)}
                            >
                              <option value="">Select pricing market</option>
                              {pricingMarkets.map((market) => (
                                <option key={market.name} value={market.name}>
                                  {market.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="0"
                              placeholder="Regular price"
                              value={item.regularPrice}
                              onChange={(e) => updateMarketPrice(index, "regularPrice", e.target.value)}
                            />
                            <input
                              type="number"
                              min="0"
                              placeholder="Sale price (optional)"
                              value={item.salePrice}
                              onChange={(e) => updateMarketPrice(index, "salePrice", e.target.value)}
                            />
                            <input
                              type="date"
                              value={item.startDate}
                              onChange={(e) => updateMarketPrice(index, "startDate", e.target.value)}
                            />
                            <input
                              type="date"
                              value={item.endDate}
                              onChange={(e) => updateMarketPrice(index, "endDate", e.target.value)}
                            />
                            <button type="button" className="danger" onClick={() => removeMarketPrice(index)}>
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="admin-bundle-preview">
                        <span>Market priority</span>
                        <p>India base price wins first, then country override, then matched market price, then fallback international price.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="product-composer-panel">
                <div className="product-composer-panel-head">
                  <div>
                    <h4>Relationships</h4>
                    <p>Build bundles and curate cross-links that help product discovery.</p>
                  </div>
                </div>
                <div className="form-grid">
                  {productType === "bundle" ? (
                    <div className="admin-field admin-field-wide">
                      <span>Bundle Products</span>
                      <div className="admin-bundle-builder">
                        <div className="admin-bundle-builder-head">
                          <strong>Create this bundle from existing products</strong>
                          <button type="button" onClick={addBundleItem}>
                            Add Bundle Item
                          </button>
                        </div>

                        <div className="admin-bundle-builder-list">
                          {bundleItems.map((item, index) => (
                            <div key={`bundle-item-${index}`} className="admin-bundle-builder-row">
                              <select
                                value={item.productId}
                                onChange={(e) => updateBundleItem(index, "productId", e.target.value)}
                              >
                                <option value="">Select existing product</option>
                                {availableBundleProducts.map((product) => (
                                  <option key={product._id} value={product._id}>
                                    {product.name}
                                  </option>
                                ))}
                              </select>

                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateBundleItem(index, "quantity", e.target.value)}
                                placeholder="Qty"
                              />

                              <button type="button" className="danger" onClick={() => removeBundleItem(index)}>
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="admin-bundle-preview">
                          <span>Bundle preview</span>
                          {selectedBundleProducts.length > 0 ? (
                            <>
                              <ul>
                                {selectedBundleProducts.map((product) => (
                                  <li key={`${product._id}-${product.quantity}`}>
                                    {product.name} x {product.quantity}
                                  </li>
                                ))}
                              </ul>
                              <p><strong>Calculated bundle price:</strong> Rs {calculatedBundlePrice}</p>
                            </>
                          ) : (
                            <p>No products selected for this bundle yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="admin-field admin-field-wide">
                    <span>Related Products</span>
                    <div className="admin-bundle-builder">
                      <div className="admin-bundle-builder-head">
                        <strong>Choose products to show in the Related Products section</strong>
                        <button type="button" onClick={addRelatedProductItem}>
                          Add Related Product
                        </button>
                      </div>

                      <div className="admin-bundle-builder-list">
                        {relatedProductItems.map((item, index) => (
                          <div key={`related-product-${index}`} className="admin-bundle-builder-row related-product-row">
                            <select
                              value={item.productId}
                              onChange={(e) => updateRelatedProductItem(index, e.target.value)}
                            >
                              <option value="">Select related product</option>
                              {availableBundleProducts.map((product) => (
                                <option key={product._id} value={product._id}>
                                  {product.name}
                                </option>
                              ))}
                            </select>

                            <button type="button" className="danger" onClick={() => removeRelatedProductItem(index)}>
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="admin-bundle-preview">
                        <span>Related products preview</span>
                        {selectedRelatedProducts.length > 0 ? (
                          <ul>
                            {selectedRelatedProducts.map((relatedProduct) => (
                              <li key={relatedProduct._id}>
                                {relatedProduct.name}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No related products selected yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="product-composer-panel">
                <div className="product-composer-panel-head">
                  <div>
                    <h4>Media</h4>
                    <p>Add a strong product thumbnail and extra images for the gallery.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="admin-field">
                    <span>Primary Image URL</span>
                    <input placeholder="Paste the main image URL" value={image} onChange={(e) => setImage(e.target.value)} />
                  </label>
                  <div className="admin-field">
                    <span>Upload Primary Image</span>
                    <label className="hero-banner-admin-upload-btn">
                      {isUploadingProductImages ? "Optimizing..." : "Choose Image"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePrimaryImageFileUpload}
                        disabled={isUploadingProductImages}
                      />
                    </label>
                  </div>
                  <label className="admin-field admin-field-wide">
                    <span>Additional Image URLs</span>
                    <textarea
                      className="admin-images-textarea"
                      placeholder="Add more image URLs separated by commas or new lines"
                      value={imagesInput}
                      onChange={(e) => setImagesInput(e.target.value)}
                      rows={4}
                    />
                  </label>
                  <div className="admin-field admin-field-wide">
                    <span>Upload Gallery Images</span>
                    <label className="hero-banner-admin-upload-btn">
                      {isUploadingProductImages ? "Optimizing..." : "Choose Multiple Images"}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleGalleryImageFileUpload}
                        disabled={isUploadingProductImages}
                      />
                    </label>
                  </div>
                </div>
              </section>
            </div>

            <aside className="product-composer-side">
              <div className="product-composer-side-card">
                <span className="product-composer-side-kicker">Live Preview</span>
                <h4>{name.trim() || "New product preview"}</h4>
                <p>{description.trim() || "Your description, pricing, and image choices will show here as you build the product."}</p>
                <div className="product-composer-price-line">
                  <strong>Rs {formSummary.numericPrice || 0}</strong>
                  <small>{productType === "bundle" ? "Bundle pricing" : "Base pricing"}</small>
                </div>
                <div className="product-composer-side-list">
                  <div><span>Type</span><strong>{productType === "bundle" ? "Bundle" : "Single"}</strong></div>
                  <div><span>Category</span><strong>{category || "General"}</strong></div>
                  <div><span>Stock</span><strong>{formSummary.numericStock || 0}</strong></div>
                </div>
              </div>

              <div className="admin-thumbnail-preview product-composer-preview-card">
                <img
                  src={imagePreview}
                  alt={name.trim() || "Product thumbnail preview"}
                  onError={(e) => {
                    e.currentTarget.src = "https://picsum.photos/120";
                  }}
                />
                <div>
                  <strong>Thumbnail Preview</strong>
                  <span>{image.trim() ? "Using current image URL" : "Showing fallback preview image"}</span>
                </div>
              </div>
            </aside>
          </div>
          {imagePreviews.length > 0 && (
            <div className="admin-thumbnail-strip">
              {imagePreviews.map((previewImage, index) => (
                <img
                  key={`${previewImage}-${index}`}
                  src={previewImage}
                  alt={`Product preview ${index + 1}`}
                  onError={(e) => {
                    e.currentTarget.src = "https://picsum.photos/72";
                  }}
                />
              ))}
            </div>
          )}
          {formMessage && (
            <p className={`admin-form-message ${formMessage.includes("successfully") ? "success" : "error"}`}>
              {formMessage}
            </p>
          )}
          <div className="actions">
            <button onClick={saveProduct} disabled={isSavingProduct}>
              {isSavingProduct ? "Saving..." : editingProduct ? "Update Product" : "Add Product"}
            </button>
            {editingProduct && (
              <button className="danger" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </section>

        <section className="card add-product-card hero-banner-admin-card">
          <div className="add-product-card-header">
            <div>
              <h3>Homepage Hero Banner</h3>
              <p>Manage multiple featured banners and choose which product each one should open.</p>
            </div>
            <div className="add-product-status-badges">
              <span className={heroBanners.length > 1 ? "status-badge valid" : "status-badge"}>
                {heroBanners.length} Banner{heroBanners.length === 1 ? "" : "s"}
              </span>
              <span className={heroBanners.some((item) => item.image.trim()) ? "status-badge valid" : "status-badge"}>Images</span>
              <span className={heroBanners.some((item) => item.productId) ? "status-badge valid" : "status-badge"}>Linked Products</span>
            </div>
          </div>

          <div className="hero-banner-admin-list">
            {heroBanners.map((banner, index) => (
              <button
                key={`hero-banner-${index}`}
                type="button"
                className={`hero-banner-admin-list-item${activeHeroBannerIndex === index ? " active" : ""}`}
                onClick={() => setActiveHeroBannerIndex(index)}
              >
                <span>Banner {index + 1}</span>
                <strong>{banner.image.trim() ? "Configured" : "Empty"}</strong>
              </button>
            ))}
            <button type="button" className="hero-banner-admin-add-btn" onClick={addHeroBanner}>
              + Add Banner
            </button>
            <label className="hero-banner-admin-upload-btn">
              {isUploadingHeroBanners ? "Uploading..." : "Upload Multiple Images"}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleHeroBannerFileUpload}
                disabled={isUploadingHeroBanners}
              />
            </label>
          </div>

          <div className="hero-banner-admin-layout">
            <div className="hero-banner-admin-preview">
              {activeHeroBanner.image.trim() ? (
                <img
                  src={activeHeroBanner.image.trim()}
                  alt="Hero banner preview"
                  onError={(e) => {
                    e.currentTarget.src = "https://picsum.photos/1200/420";
                  }}
                />
              ) : (
                <div className="hero-banner-admin-empty">
                  <strong>No banner image selected</strong>
                  <span>Paste a hero banner URL to preview how it will look on the home page.</span>
                </div>
              )}
            </div>

            <div className="hero-banner-admin-controls">
              <label className="admin-field admin-field-wide">
                <span>Banner Image URL</span>
                <textarea
                  className="hero-banner-url-field"
                  placeholder="https://example.com/banner.jpg"
                  value={activeHeroBanner.image}
                  onChange={(e) => updateHeroBanner(activeHeroBannerIndex, "image", e.target.value)}
                  rows={4}
                />
              </label>

              <label className="admin-field admin-field-wide">
                <span>Banner Opens Product</span>
                <select
                  value={activeHeroBanner.productId}
                  onChange={(e) => updateHeroBanner(activeHeroBannerIndex, "productId", e.target.value)}
                >
                  <option value="">No linked product</option>
                  {products.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>

              {editingProduct?._id ? (
                <button
                  type="button"
                  className="hero-banner-admin-link-btn"
                  onClick={() => updateHeroBanner(activeHeroBannerIndex, "productId", editingProduct._id)}
                >
                  Link Banner To Current Edit Product
                </button>
              ) : null}

              {heroBanners.length > 1 ? (
                <button
                  type="button"
                  className="hero-banner-admin-remove-btn"
                  onClick={() => removeHeroBanner(activeHeroBannerIndex)}
                >
                  Remove This Banner
                </button>
              ) : null}

              <div className="hero-banner-admin-meta">
                <div>
                  <span>Currently linked</span>
                  <strong>{selectedHeroProduct?.name || "No product selected"}</strong>
                </div>
                <div>
                  <span>Recommended format</span>
                  <strong>Wide landscape image</strong>
                </div>
              </div>

              <div className="pricing-actions-row">
                <button className="pricing-save-btn" onClick={saveHeroBanner} disabled={isSavingHeroBanner}>
                  {isSavingHeroBanner ? "Saving..." : "Save Hero Banners"}
                </button>
                <button
                  type="button"
                  className="hero-banner-admin-link-btn"
                  onClick={handleOptimizeStoredImages}
                  disabled={isOptimizingStoredImages}
                >
                  {isOptimizingStoredImages ? "Optimizing Stored Images..." : "Optimize Existing Stored Images"}
                </button>
                <span>Clicking each live banner will open its selected product page.</span>
              </div>

              {heroBannerMessage ? (
                <p className={`pricing-message ${heroBannerMessage.includes("updated") ? "success" : "error"}`}>
                  {heroBannerMessage}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="card upload-card">
          <h3>Bulk Upload Files</h3>
          <p className="upload-help">
            Upload a CSV or JSON file with fields: <code>name, price, internationalPrice, internationalCountryPrices, marketPrices, image, description, aboutProduct, category, stock</code>
          </p>
          <label className="upload-dropzone">
            <span className="upload-title">Choose CSV / JSON file</span>
            <span className="upload-subtitle">
              {uploading ? "Uploading..." : "Click to browse and upload products"}
            </span>
            <input
              type="file"
              accept=".csv,.json,application/json,text/csv"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
          {uploadMessage && (
            <p className={`upload-message ${uploadMessage.includes("failed") ? "error" : "success"}`}>
              {uploadMessage}
            </p>
          )}
        </section>

        <section className="card">
          <h3>All Products</h3>
          <div className="products-tools">
            <input
              className="product-search"
              placeholder="Search product by name, category, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <p>
              Showing {filteredProducts.length} of {products.length}
            </p>
          </div>
          <div className="table">
            {isLoadingProducts
              ? Array.from({ length: 5 }).map((_, idx) => (
                  <div key={`products-skeleton-${idx}`} className="table-row skeleton-row">
                    <span className="skeleton-block" />
                    <span className="skeleton-block" />
                    <span className="skeleton-block" />
                    <span className="skeleton-block" />
                  </div>
                ))
              : filteredProducts.map((product) => (
                  <div key={product._id} className="table-row">
                    <div className="admin-product-thumb-cell">
                      <img
                        className="admin-product-thumb"
                        src={product.image || "https://picsum.photos/64"}
                        alt={product.name}
                        onError={(e) => {
                          e.currentTarget.src = "https://picsum.photos/64";
                        }}
                      />
                      <span>
                        <strong>{product.name}</strong>
                        <small>{product.category || "General"}</small>
                        {product.lastUpdatedAt ? (
                          <small>
                            Last updated by {product.lastUpdatedByName || product.lastUpdatedByEmail || "Admin"} on{" "}
                            {formatDate(product.lastUpdatedAt)} {formatTime(product.lastUpdatedAt)}
                          </small>
                        ) : null}
                      </span>
                    </div>
                      <span>
                        Rs {product.price}
                        {product.internationalPrice !== null && product.internationalPrice !== undefined
                          ? ` / Intl Rs ${product.internationalPrice}`
                          : ""}
                      {Array.isArray(product.internationalCountryPrices) && product.internationalCountryPrices.length > 0
                        ? ` / ${product.internationalCountryPrices.length} country override${
                            product.internationalCountryPrices.length === 1 ? "" : "s"
                          }`
                        : ""}
                      {Array.isArray(product.marketPrices) && product.marketPrices.length > 0
                        ? ` / ${product.marketPrices.length} market price${
                            product.marketPrices.length === 1 ? "" : "s"
                          }`
                        : ""}
                        {Array.isArray(product.internationalCountryPrices) && product.internationalCountryPrices.length > 0
                          ? ` (${product.internationalCountryPrices
                              .map((item) => `${item.country}: Rs ${item.price}`)
                              .join(", ")})`
                          : ""}
                        {Array.isArray(product.marketPrices) && product.marketPrices.length > 0
                          ? ` ${product.marketPrices
                              .map((item) => {
                                const regular = `Rs ${item.regularPrice}`;
                                const sale = item.salePrice !== null && item.salePrice !== undefined ? ` / Sale Rs ${item.salePrice}` : "";
                                return `[${item.market}: ${regular}${sale}]`;
                              })
                              .join(" ")}`
                          : ""}
                      </span>
                    <span>
                      <span
                        className={
                          Number(product.stock || 0) === 0
                            ? "stock-pill stock-pill-critical"
                            : Number(product.stock || 0) <= 5
                              ? "stock-pill stock-pill-warning"
                              : "stock-pill stock-pill-ok"
                        }
                      >
                        {Number(product.stock || 0) === 0 ? "Out of stock" : `Stock: ${product.stock ?? 0}`}
                      </span>
                    </span>
                    <div className="actions">
                      <button onClick={() => startEdit(product)}>Edit</button>
                      <button className="danger" onClick={() => deleteProduct(product._id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
          </div>
          {!isLoadingProducts && filteredProducts.length === 0 && (
            <p style={{ marginTop: "10px" }}>No matching products found.</p>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminAddProducts;

