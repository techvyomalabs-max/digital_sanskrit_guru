import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import "./AdminDashboard.css";

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

function AdminAddProducts() {
  const { token } = useAuth();
  const formSectionRef = useRef(null);
  const nameInputRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");
  const [imagesInput, setImagesInput] = useState("");
  const [description, setDescription] = useState("");
  const [aboutProduct, setAboutProduct] = useState("");
  const [category, setCategory] = useState("General");
  const [categoryOptions, setCategoryOptions] = useState(DEFAULT_CATEGORY_OPTIONS);
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
  const imagePreview = image.trim() || "https://picsum.photos/120";
  const imagePreviews = imagesInput
    .split(/\r?\n|,/)
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
      })
      .catch(() => {
        if (!active) return;
        setCategoryOptions(DEFAULT_CATEGORY_OPTIONS);
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
      productCategories: nextCategories
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
    const numericPrice = Number(price);
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
  }, [image, name, price, stock]);

  const resetForm = () => {
    setName("");
    setPrice("");
    setImage("");
    setImagesInput("");
    setDescription("");
    setAboutProduct("");
    setCategory("General");
    setStock("1");
    setEditingProduct(null);
    setFormMessage("");
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

  const saveProduct = async () => {
    if (!formSummary.isValid) {
      setFormMessage("Complete name, price, stock, and primary image before saving.");
      return;
    }

    const payload = {
      name: formSummary.normalizedName,
      price: formSummary.numericPrice,
      image: image.trim(),
      images: imagesInput,
      description: description.trim(),
      aboutProduct,
      category: category.trim() || "General",
      stock: formSummary.numericStock
    };

    setIsSavingProduct(true);
    setFormMessage("");

    try {
      if (editingProduct?._id) {
        await axios.put(`/api/products/${editingProduct._id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFormMessage("Product updated successfully.");
      } else {
        await axios.post("/api/products", payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFormMessage("Product added successfully.");
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
    setImage(product.image || "");
    setImagesInput(Array.isArray(product.images) && product.images.length > 0 ? product.images.join("\n") : product.image || "");
    setDescription(product.description || "");
    setAboutProduct(Array.isArray(product.aboutProduct) ? product.aboutProduct.join("\n") : "");
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
    if (!productName || Number.isNaN(productPrice)) return null;

    return {
      name: productName,
      price: productPrice,
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
              <span>Price</span>
              <input type="number" min="1" placeholder="e.g. 999" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <label className="admin-field">
              <span>Primary Image URL</span>
              <input placeholder="Paste the main image URL" value={image} onChange={(e) => setImage(e.target.value)} />
            </label>
            <div className="admin-field admin-field-wide">
              <span>Select Product Category</span>
              <div className="admin-category-manager">
                <div className="admin-category-picker">
                  {categoryOptions.map((option) => (
                    <div
                      key={option}
                      className={`admin-category-picker-item${category === option ? " active" : ""}${
                        editingCategoryName === option ? " editing" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="admin-category-picker-select"
                        onClick={() => setCategory(option)}
                      >
                        {option}
                      </button>
                      <button
                        type="button"
                        className="admin-category-picker-edit-btn"
                        onClick={() => handleStartCategoryEdit(option)}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
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
                      <button type="button" className="danger" onClick={handleCancelCategoryEdit}>
                        Cancel
                      </button>
                    ) : null}
                  </div>
                  {categoryMessage ? (
                    <small style={{ color: categoryMessage.includes("successfully") ? "var(--admin-accent)" : "#dc2626" }}>
                      {categoryMessage}
                    </small>
                  ) : null}
                </div>
              </div>
            </div>
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
              <span>About This Product</span>
              <textarea
                placeholder={"Add one point per line\nExample: Published in Sanskrit\nExample: 848 page edition"}
                value={aboutProduct}
                onChange={(e) => setAboutProduct(e.target.value)}
                rows={5}
              />
            </label>
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
          </div>
          <div className="admin-thumbnail-preview">
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

        <section className="card upload-card">
          <h3>Bulk Upload Files</h3>
          <p className="upload-help">
            Upload a CSV or JSON file with fields: <code>name, price, image, description, aboutProduct, category, stock</code>
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
                      </span>
                    </div>
                    <span>Rs {product.price}</span>
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

