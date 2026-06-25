import React, { useState, useMemo } from "react";
import axios from "axios";
import {
  Search,
  ExternalLink,
  ShoppingCart,
  AlertTriangle,
  Zap,
  X,
  TrendingDown,
  Clock,
  ChevronRight,
  ArrowRight,
  BookOpen,
  Cpu,
  Globe,
  Lock,
} from "lucide-react";

interface VendorListing {
  storeName: string;
  price: number;
  url: string;
  isExactMatch: boolean;
  inStock: boolean;
  condition?: "new" | "refurbished" | "used";
  title?: string;
}

interface ProductPayload {
  title: string;
  image: string;
  modelNumber: string;
  upc: string;
  lowestPrice: number;
  sources: VendorListing[];
  comparisonQuality: "exact" | "approximate";
  responseMs: number;
}

const CATEGORIES = [
  {
    label: "Laptops",
    icon: "💻",
    brands: ["Apple", "Dell", "Lenovo", "HP", "Asus", "Microsoft"],
  },
  {
    label: "Phones",
    icon: "📱",
    brands: ["Apple", "Samsung", "Google", "OnePlus", "Sony"],
  },
  {
    label: "Cameras",
    icon: "📷",
    brands: ["Sony", "Canon", "Nikon", "Fujifilm", "Panasonic"],
  },
  {
    label: "TVs",
    icon: "📺",
    brands: ["Samsung", "LG", "Sony", "TCL", "Vizio"],
  },
  {
    label: "Audio",
    icon: "🎧",
    brands: ["Sony", "Bose", "Apple", "Sennheiser", "JBL"],
  },
  {
    label: "Gaming",
    icon: "🎮",
    brands: ["Sony", "Microsoft", "Nintendo", "Razer", "Logitech"],
  },
];

const POPULAR = [
  { label: "MacBook Pro", emoji: "💻" },
  { label: "Sony WH-1000XM5", emoji: "🎧" },
  { label: "Samsung 65 inch TV", emoji: "📺" },
  { label: "iPad Pro", emoji: "📱" },
  { label: "Dyson V15", emoji: "🌀" },
  { label: "Nintendo Switch", emoji: "🎮" },
];

const STORE_META: Record<
  string,
  { color: string; light: string; text: string }
> = {
  Amazon: { color: "#FF9900", light: "#FFF8ED", text: "#7A4700" },
  Walmart: { color: "#0071CE", light: "#EFF8FF", text: "#0c4a6e" },
  eBay: { color: "#E53238", light: "#FFF1F2", text: "#881337" },
};

const PRICE_RANGES = [
  { label: "Under $50", min: 0, max: 50 },
  { label: "$50–$200", min: 50, max: 200 },
  { label: "$200–$500", min: 200, max: 500 },
  { label: "$500–$1k", min: 500, max: 1000 },
  { label: "Over $1k", min: 1000, max: Infinity },
];

const ROADMAP = [
  {
    icon: <BookOpen size={18} />,
    title: "Product reviews",
    desc: "See aggregated review scores and rating counts from Amazon, Newegg and eBay side by side — not just price, but whether the product is actually worth buying.",
  },
  {
    icon: <Globe size={18} />,
    title: "More retailers",
    desc: "Sam's Club, Target, and BestBuy are next. Each needs a reliable price source — we only add a retailer when the link and price are accurate, not just present.",
  },
  {
    icon: <Lock size={18} />,
    title: "Price drop alerts",
    desc: "Set a target price on any product. Get notified the moment any retailer drops below it — no need to keep checking manually.",
  },
  {
    icon: <Cpu size={18} />,
    title: "Price history",
    desc: "See how a product's price has moved over the last 30, 60, and 90 days across retailers. Know whether today's price is actually a deal.",
  },
];

// Warm neutral palette
const WARM = {
  canvas: "#F5F2EE",
  surface: "#FDFCFA",
  border: "#E8E3DC",
  muted: "#9C9488",
  text: "#1A1714",
  accent: "#2A2522",
};

// Condition badge — shown on every card, prominent for non-new items
function ConditionBadge({
  condition,
}: {
  condition?: "new" | "refurbished" | "used";
}) {
  if (!condition || condition === "new")
    return (
      <span
        style={{
          fontSize: "0.65rem",
          fontWeight: 700,
          color: "#166534",
          backgroundColor: "#f0fdf4",
          padding: "0.15rem 0.5rem",
          borderRadius: "999px",
          border: "1px solid #bbf7d0",
        }}
      >
        New
      </span>
    );
  if (condition === "refurbished")
    return (
      <span
        style={{
          fontSize: "0.65rem",
          fontWeight: 700,
          color: "#92400e",
          backgroundColor: "#fffbeb",
          padding: "0.15rem 0.5rem",
          borderRadius: "999px",
          border: "1px solid #fde68a",
        }}
      >
        Refurbished
      </span>
    );
  return (
    <span
      style={{
        fontSize: "0.65rem",
        fontWeight: 700,
        color: "#7f1d1d",
        backgroundColor: "#fef2f2",
        padding: "0.15rem 0.5rem",
        borderRadius: "999px",
        border: "1px solid #fecaca",
      }}
    >
      Used
    </span>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cacheHit, setCacheHit] = useState(false);
  const [showRoadmap, setShowRoadmap] = useState(false);

  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<{
    min: number;
    max: number;
  } | null>(null);
  const [sortBy, setSortBy] = useState<"price-asc" | "price-desc">("price-asc");
  const [onlyInStock, setOnlyInStock] = useState(false);

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setProduct(null);
    setSelectedStores([]);
    setPriceRange(null);
    setOnlyInStock(false);
    try {
      const res = await axios.get(`/api/search?q=${encodeURIComponent(q)}`);
      setCacheHit(res.headers["x-cache"] === "HIT");
      const data = Array.isArray(res.data) ? res.data[0] : res.data;
      if (data?.sources) setProduct(data);
      else setError("No products found.");
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error ?? "Search failed.")
          : "Search failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(
      [activeBrand, activeCategory, query].filter(Boolean).join(" ") || query,
    );
  };

  const handleCategory = (cat: string) => {
    if (activeCategory === cat) {
      setActiveCategory(null);
      setActiveBrand(null);
    } else {
      setActiveCategory(cat);
      setActiveBrand(null);
      setQuery("");
    }
  };

  const handleBrand = (brand: string) => {
    const next = activeBrand === brand ? null : brand;
    setActiveBrand(next);
    const q = [next, activeCategory].filter(Boolean).join(" ");
    if (q) runSearch(q);
  };

  const clearAll = () => {
    setActiveCategory(null);
    setActiveBrand(null);
    setQuery("");
    setProduct(null);
    setError(null);
  };

  const uniqueStores = useMemo(
    () => Array.from(new Set(product?.sources.map((s) => s.storeName) ?? [])),
    [product],
  );

  const processed = useMemo(() => {
    if (!product?.sources) return [];
    let items = [...product.sources];
    if (selectedStores.length > 0)
      items = items.filter((s) => selectedStores.includes(s.storeName));
    if (priceRange)
      items = items.filter(
        (s) => s.price >= priceRange.min && s.price <= priceRange.max,
      );
    if (onlyInStock) items = items.filter((s) => s.inStock);
    return items.sort((a, b) =>
      sortBy === "price-asc" ? a.price - b.price : b.price - a.price,
    );
  }, [product, selectedStores, priceRange, sortBy, onlyInStock]);

  const exact = processed.filter((s) => s.isExactMatch);
  const other = processed.filter((s) => !s.isExactMatch);
  const allExact = product?.sources.filter((s) => s.isExactMatch) ?? [];
  const highest =
    allExact.length > 0 ? Math.max(...allExact.map((s) => s.price)) : 0;
  const lowest =
    allExact.length > 0 ? Math.min(...allExact.map((s) => s.price)) : 0;
  const activeCat = CATEGORIES.find((c) => c.label === activeCategory);
  const hasFilters = selectedStores.length > 0 || priceRange || onlyInStock;

  const chip = (
    label: string,
    active: boolean,
    onClick: () => void,
    activeColor = "#1A1714",
  ) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: "0.35rem 0.875rem",
        backgroundColor: active ? activeColor : "transparent",
        border: `1px solid ${active ? activeColor : WARM.border}`,
        borderRadius: "999px",
        fontSize: "0.78rem",
        fontWeight: active ? 600 : 400,
        color: active ? "#fff" : "#334155",
        cursor: "pointer",
        transition: "all 0.12s",
        whiteSpace: "nowrap" as const,
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        backgroundColor: WARM.canvas,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column" as const,
        color: WARM.text,
      }}
    >
      {/* ── NAV ─────────────────────────────────────────────── */}
      <nav
        style={{
          backgroundColor: WARM.surface,
          borderBottom: `1px solid ${WARM.border}`,
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 2rem",
            display: "flex",
            alignItems: "center",
            height: "64px",
            gap: "2rem",
          }}
        >
          {/* Logo */}
          <button
            onClick={clearAll}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexShrink: 0,
            }}
          >
            <TrendingDown size={20} color={WARM.text} />
            <span
              style={{
                fontSize: "1.15rem",
                fontWeight: 800,
                color: WARM.text,
                letterSpacing: "-0.04em",
              }}
            >
              SmartScan
            </span>
          </button>

          {/* Category nav */}
          <div style={{ display: "flex", gap: "0.125rem", flex: 1 }}>
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.label;
              return (
                <button
                  key={cat.label}
                  onClick={() => handleCategory(cat.label)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "0.4rem 0.75rem",
                    background: "none",
                    border: "none",
                    borderRadius: "0.375rem",
                    fontSize: "0.82rem",
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? WARM.text : "#334155",
                    cursor: "pointer",
                    borderBottom: isActive
                      ? `2px solid ${WARM.text}`
                      : "2px solid transparent",
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Right actions */}
          <div
            style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}
          >
            <button
              onClick={() => setShowRoadmap(!showRoadmap)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.45rem 1rem",
                backgroundColor: WARM.text,
                border: `1px solid ${WARM.text}`,
                borderRadius: "999px",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <BookOpen size={14} /> What's coming
            </button>
          </div>
        </div>

        {/* Brand strip */}
        {activeCat && (
          <div
            style={{
              borderTop: `1px solid ${WARM.border}`,
              backgroundColor: WARM.canvas,
            }}
          >
            <div
              style={{
                maxWidth: "1200px",
                margin: "0 auto",
                padding: "0.625rem 2rem",
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                flexWrap: "wrap" as const,
              }}
            >
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  color: "#475569",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase" as const,
                  marginRight: "0.25rem",
                }}
              >
                Brand
              </span>
              {activeCat.brands.map((brand) => {
                const isActive = activeBrand === brand;
                return (
                  <button
                    key={brand}
                    onClick={() => handleBrand(brand)}
                    style={{
                      padding: "0.3rem 0.75rem",
                      backgroundColor: isActive ? WARM.text : WARM.surface,
                      border: `1px solid ${isActive ? WARM.text : WARM.border}`,
                      borderRadius: "999px",
                      fontSize: "0.78rem",
                      fontWeight: isActive ? 700 : 400,
                      color: isActive ? "#fff" : "#334155",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {brand}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* ── ROADMAP PANEL ──────────────────────────────────── */}
      {showRoadmap && (
        <div style={{ backgroundColor: WARM.text, color: "#fff" }}>
          <div
            style={{
              maxWidth: "1200px",
              margin: "0 auto",
              padding: "3rem 2rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "2rem",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase" as const,
                    color: "#9C9488",
                    margin: "0 0 0.5rem",
                  }}
                >
                  Roadmap
                </p>
                <h2
                  style={{
                    fontSize: "1.75rem",
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: "-0.03em",
                  }}
                >
                  What's being built
                </h2>
                <p
                  style={{
                    color: "#9C9488",
                    margin: "0.5rem 0 0",
                    fontSize: "0.875rem",
                  }}
                >
                  SmartScan is actively developed. Here's what's coming next.
                </p>
              </div>
              <button
                onClick={() => setShowRoadmap(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#9C9488",
                  display: "flex",
                }}
              >
                <X size={20} />
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "1.25rem",
              }}
            >
              {ROADMAP.map((item, i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor: "#2A2522",
                    borderRadius: "0.875rem",
                    padding: "1.5rem",
                    border: "1px solid #3A3330",
                  }}
                >
                  <div style={{ color: "#9C9488", marginBottom: "0.875rem" }}>
                    {item.icon}
                  </div>
                  <h3
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      margin: "0 0 0.5rem",
                      color: "#fff",
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      fontSize: "0.82rem",
                      color: "#9C9488",
                      margin: 0,
                      lineHeight: 1.6,
                    }}
                  >
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: "2rem",
                padding: "1.25rem 1.5rem",
                backgroundColor: "#2A2522",
                borderRadius: "0.875rem",
                border: "1px solid #3A3330",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap" as const,
                gap: "1rem",
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>
                  API documentation
                </p>
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    color: "#9C9488",
                    fontSize: "0.8rem",
                  }}
                >
                  <code
                    style={{
                      backgroundColor: "#1A1714",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "0.25rem",
                      fontSize: "0.78rem",
                    }}
                  >
                    GET /api/search?q={"{product name}"}
                  </code>{" "}
                  — Returns live prices from Amazon, Walmart & eBay. Rate
                  limited to 30 req/min.
                </p>
              </div>
              <a
                href="/api/health"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.6rem 1.125rem",
                  backgroundColor: "#fff",
                  color: WARM.text,
                  borderRadius: "999px",
                  textDecoration: "none",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                }}
              >
                View health status <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN ───────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          maxWidth: "1200px",
          margin: "0 auto",
          width: "100%",
          padding: "0 2rem",
        }}
      >
        {/* Hero search section */}
        <section
          style={{
            padding: "5rem 0 3.5rem",
            textAlign: "center" as const,
            borderBottom: product ? `1px solid ${WARM.border}` : "none",
          }}
        >
          {!product && !loading && (
            <>
              <p
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase" as const,
                  color: "#475569",
                  margin: "0 0 1.25rem",
                }}
              >
                Real-time price comparison
              </p>
              <h1
                style={{
                  fontSize: "clamp(2.5rem, 5vw, 4rem)",
                  fontWeight: 900,
                  letterSpacing: "-0.04em",
                  margin: "0 0 1.5rem",
                  lineHeight: 1.1,
                  color: WARM.text,
                }}
              >
                Find the best price.
                <br />
                Every retailer. Now.
              </h1>
              <p
                style={{
                  color: "#475569",
                  fontSize: "1.05rem",
                  margin: "0 0 2.5rem",
                  maxWidth: "480px",
                  marginLeft: "auto",
                  marginRight: "auto",
                  lineHeight: 1.7,
                }}
              >
                We compare Amazon, Walmart and eBay so you don't have to.
              </p>
            </>
          )}

          {/* Search bar */}
          <form
            onSubmit={handleSearch}
            style={{
              display: "flex",
              gap: "0.625rem",
              maxWidth: "600px",
              margin: "0 auto",
            }}
          >
            <div style={{ position: "relative", flexGrow: 1 }}>
              <Search
                size={16}
                style={{
                  position: "absolute",
                  left: "1rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                }}
              />
              <input
                type="text"
                placeholder={
                  activeCategory
                    ? `Search ${activeBrand ? activeBrand + " " : ""}${activeCategory}...`
                    : "Search any product..."
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.875rem 1rem 0.875rem 2.75rem",
                  fontSize: "0.95rem",
                  border: `1.5px solid ${WARM.border}`,
                  borderRadius: "0.75rem",
                  boxSizing: "border-box" as const,
                  outline: "none",
                  backgroundColor: WARM.surface,
                  color: WARM.text,
                  fontFamily: "inherit",
                }}
              />
              {(activeCategory || activeBrand) && (
                <button
                  type="button"
                  onClick={clearAll}
                  style={{
                    position: "absolute",
                    right: "0.875rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#475569",
                    display: "flex",
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "0.875rem 1.75rem",
                backgroundColor: loading ? WARM.muted : WARM.text,
                color: "#fff",
                border: "none",
                borderRadius: "0.75rem",
                fontSize: "0.95rem",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                whiteSpace: "nowrap" as const,
                fontFamily: "inherit",
              }}
            >
              {loading ? "Scanning..." : "Compare"}
            </button>
          </form>

          {/* Popular tiles — only on empty state */}
          {!product && !loading && !error && (
            <div style={{ marginTop: "2rem" }}>
              <p
                style={{
                  fontSize: "0.72rem",
                  color: "#64748b",
                  fontWeight: 600,
                  marginBottom: "0.75rem",
                }}
              >
                Popular searches
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "center",
                  flexWrap: "wrap" as const,
                }}
              >
                {POPULAR.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      setQuery(s.label);
                      runSearch(s.label);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "0.5rem 1rem",
                      backgroundColor: WARM.surface,
                      border: `1px solid ${WARM.border}`,
                      borderRadius: "999px",
                      fontSize: "0.82rem",
                      fontWeight: 500,
                      color: "#334155",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <span>{s.emoji}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "5rem 0" }}>
            <p
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase" as const,
                color: "#475569",
                margin: "0 0 1rem",
              }}
            >
              Scanning retailers
            </p>
            <h3
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: WARM.text,
                margin: "0 0 0.75rem",
                letterSpacing: "-0.03em",
              }}
            >
              {[activeBrand, activeCategory].filter(Boolean).join(" ") || query}
            </h3>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "center",
                flexWrap: "wrap" as const,
              }}
            >
              {["Amazon", "Walmart", "eBay"].map((store, i) => (
                <span
                  key={store}
                  style={{
                    padding: "0.35rem 0.875rem",
                    borderRadius: "999px",
                    backgroundColor: WARM.surface,
                    border: `1px solid ${WARM.border}`,
                    fontSize: "0.78rem",
                    color: "#475569",
                    animation: `fadepulse ${1 + i * 0.2}s ease-in-out infinite`,
                  }}
                >
                  {store}
                </span>
              ))}
            </div>
            <style>{`@keyframes fadepulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              display: "flex",
              gap: "0.875rem",
              padding: "1.25rem 1.5rem",
              backgroundColor: "#FFF1F1",
              color: "#7f1d1d",
              borderRadius: "0.875rem",
              border: "1px solid #fecaca",
              alignItems: "center",
              maxWidth: "560px",
              margin: "2rem auto",
            }}
          >
            <AlertTriangle size={20} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontWeight: 700 }}>Search failed</p>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem" }}>
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {product && !loading && (
          <div style={{ paddingTop: "2.5rem", paddingBottom: "4rem" }}>
            {/* Product summary row */}
            <div
              style={{
                display: "flex",
                gap: "2rem",
                alignItems: "center",
                marginBottom: "2.5rem",
                flexWrap: "wrap" as const,
              }}
            >
              <img
                src={product.image}
                alt={product.title}
                style={{
                  width: "80px",
                  height: "80px",
                  objectFit: "contain" as const,
                  borderRadius: "0.625rem",
                  border: `1px solid ${WARM.border}`,
                  backgroundColor: WARM.surface,
                  flexShrink: 0,
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=150";
                }}
              />
              <div style={{ flex: 1, minWidth: "200px" }}>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginBottom: "0.375rem",
                    flexWrap: "wrap" as const,
                  }}
                >
                  {cacheHit && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        color: "#1d4ed8",
                        backgroundColor: "#eff6ff",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "999px",
                        border: "1px solid #bfdbfe",
                      }}
                    >
                      <Zap size={10} /> Cached
                    </span>
                  )}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      color: "#6b21a8",
                      backgroundColor: "#faf5ff",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "999px",
                      border: "1px solid #e9d5ff",
                    }}
                  >
                    <AlertTriangle size={10} /> Specs may vary across retailers
                  </span>
                </div>
                <h2
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    margin: "0 0 0.25rem",
                    color: WARM.text,
                    lineHeight: 1.4,
                  }}
                >
                  {/* Normalize: 8-10 words, strip trailing punctuation/specs after dash/pipe */}
                  {product.title
                    ? product.title
                        .split(" ")
                        .slice(0, 9)
                        .join(" ")
                        .replace(/\s*[,|·•–—].*$/, "")
                        .trim()
                    : query}
                </h2>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#475569" }}>
                  Model: {product.modelNumber} · UPC: {product.upc}
                </p>
              </div>

              {/* Price summary */}
              <div style={{ display: "flex", gap: "1rem" }}>
                <div style={{ textAlign: "right" as const }}>
                  <p
                    style={{
                      margin: "0 0 0.125rem",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      color: "#475569",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    Best price
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "2.25rem",
                      fontWeight: 900,
                      color: "#15803d",
                      letterSpacing: "-0.03em",
                      lineHeight: 1,
                    }}
                  >
                    ${lowest.toFixed(2)}
                  </p>
                  {allExact.length > 1 && (
                    <p
                      style={{
                        margin: "0.2rem 0 0",
                        fontSize: "0.72rem",
                        color: "#16a34a",
                        fontWeight: 600,
                      }}
                    >
                      Save ${(highest - lowest).toFixed(2)} vs highest
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Filter bar */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                flexWrap: "wrap" as const,
                padding: "1rem 1.25rem",
                backgroundColor: WARM.surface,
                borderRadius: "0.75rem",
                border: `1px solid ${WARM.border}`,
                marginBottom: "2rem",
              }}
            >
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as "price-asc" | "price-desc")
                }
                style={{
                  padding: "0.35rem 0.75rem",
                  border: `1px solid ${WARM.border}`,
                  borderRadius: "999px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: WARM.text,
                  backgroundColor: WARM.canvas,
                  outline: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <option value="price-asc">Price ↑</option>
                <option value="price-desc">Price ↓</option>
              </select>

              <div
                style={{
                  width: "1px",
                  height: "20px",
                  backgroundColor: WARM.border,
                }}
              />

              {uniqueStores.map((store) => {
                const meta = STORE_META[store] ?? {
                  color: "#334155",
                  light: "#f8fafc",
                  text: "#334155",
                };
                const isActive = selectedStores.includes(store);
                return (
                  <button
                    key={store}
                    onClick={() =>
                      setSelectedStores((prev) =>
                        prev.includes(store)
                          ? prev.filter((s) => s !== store)
                          : [...prev, store],
                      )
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.35rem 0.875rem",
                      backgroundColor: isActive ? meta.light : "transparent",
                      border: `1px solid ${isActive ? meta.color : WARM.border}`,
                      borderRadius: "999px",
                      fontSize: "0.78rem",
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? meta.text : "#334155",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {isActive && (
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: meta.color,
                        }}
                      />
                    )}
                    {store}
                  </button>
                );
              })}

              <div
                style={{
                  width: "1px",
                  height: "20px",
                  backgroundColor: WARM.border,
                }}
              />

              {PRICE_RANGES.map((r) => {
                const isActive =
                  priceRange?.min === r.min && priceRange?.max === r.max;
                return chip(
                  r.label,
                  isActive,
                  () =>
                    setPriceRange(isActive ? null : { min: r.min, max: r.max }),
                  "#7c3aed",
                );
              })}

              <div
                style={{
                  width: "1px",
                  height: "20px",
                  backgroundColor: WARM.border,
                }}
              />
              {chip(
                "In stock",
                onlyInStock,
                () => setOnlyInStock(!onlyInStock),
                "#059669",
              )}

              {hasFilters && (
                <button
                  onClick={() => {
                    setSelectedStores([]);
                    setPriceRange(null);
                    setOnlyInStock(false);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    padding: "0.35rem 0.75rem",
                    backgroundColor: "transparent",
                    border: `1px solid ${WARM.border}`,
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    color: "#475569",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <X size={11} /> Clear
                </button>
              )}

              <span
                style={{
                  marginLeft: "auto",
                  fontSize: "0.72rem",
                  color: "#475569",
                  flexShrink: 0,
                }}
              >
                {
                  processed.filter((s) =>
                    ["Amazon", "Walmart", "eBay"].includes(s.storeName),
                  ).length
                }{" "}
                retailers
              </span>
            </div>

            {/* Retailer price cards */}
            {processed.filter((s) =>
              ["Amazon", "Walmart", "eBay"].includes(s.storeName),
            ).length > 0 && (
              <div style={{ marginBottom: "2rem" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: "1rem",
                  }}
                >
                  {processed
                    .filter((s) =>
                      ["Amazon", "Walmart", "eBay"].includes(s.storeName),
                    )
                    .map((source, idx) => {
                      const meta = STORE_META[source.storeName] ?? {
                        color: "#334155",
                        light: "#f8fafc",
                        text: "#334155",
                      };
                      const visibleSources = processed.filter((s) =>
                        ["Amazon", "Walmart", "eBay"].includes(s.storeName),
                      );
                      const isBest =
                        source.price ===
                          Math.min(...visibleSources.map((s) => s.price)) &&
                        visibleSources.length > 1;
                      const highestVisible = Math.max(
                        ...visibleSources.map((s) => s.price),
                      );
                      const savings = highestVisible - source.price;
                      return (
                        <div
                          key={idx}
                          style={{
                            backgroundColor: WARM.surface,
                            borderRadius: "0.875rem",
                            border: `1px solid ${isBest ? "#86efac" : WARM.border}`,
                            padding: "1.5rem",
                            boxShadow: isBest
                              ? "0 4px 20px rgba(34,197,94,0.1)"
                              : "none",
                          }}
                        >
                          {/* Store + badges row */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "1.25rem",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                              }}
                            >
                              <span
                                style={{
                                  backgroundColor: meta.light,
                                  color: meta.text,
                                  padding: "0.25rem 0.75rem",
                                  borderRadius: "0.375rem",
                                  fontSize: "0.8rem",
                                  fontWeight: 700,
                                }}
                              >
                                {source.storeName}
                              </span>
                              {isBest && (
                                <span
                                  style={{
                                    backgroundColor: "#dcfce7",
                                    color: "#15803d",
                                    fontSize: "0.62rem",
                                    fontWeight: 800,
                                    letterSpacing: "0.06em",
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "999px",
                                  }}
                                >
                                  BEST DEAL
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "0.375rem",
                                alignItems: "center",
                              }}
                            >
                              <ConditionBadge condition={source.condition} />
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 600,
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "999px",
                                  backgroundColor: source.inStock
                                    ? "#f0fdf4"
                                    : "#fef2f2",
                                  color: source.inStock ? "#166534" : "#991b1b",
                                }}
                              >
                                {source.inStock ? "In Stock" : "Out of Stock"}
                              </span>
                            </div>
                          </div>

                          {/* Price */}
                          <div style={{ marginBottom: "1.25rem" }}>
                            <div
                              style={{
                                fontSize: "2.25rem",
                                fontWeight: 900,
                                color: WARM.text,
                                letterSpacing: "-0.03em",
                                lineHeight: 1,
                              }}
                            >
                              ${source.price.toFixed(2)}
                            </div>
                            {savings > 0.5 && (
                              <div
                                style={{
                                  fontSize: "0.72rem",
                                  color: "#16a34a",
                                  fontWeight: 600,
                                  marginTop: "0.25rem",
                                }}
                              >
                                Save ${savings.toFixed(2)}
                              </div>
                            )}
                          </div>

                          {/* Shop button */}
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "0.5rem",
                              backgroundColor: meta.color,
                              color:
                                source.storeName === "Amazon" ? "#000" : "#fff",
                              padding: "0.75rem",
                              borderRadius: "0.625rem",
                              textDecoration: "none",
                              fontSize: "0.875rem",
                              fontWeight: 700,
                            }}
                          >
                            <ShoppingCart size={15} /> Shop at{" "}
                            {source.storeName} <ExternalLink size={13} />
                          </a>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {processed.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "3rem",
                  backgroundColor: WARM.surface,
                  borderRadius: "0.875rem",
                  border: `1px solid ${WARM.border}`,
                }}
              >
                <p style={{ margin: 0, fontWeight: 700 }}>
                  No retailers match your filters.
                </p>
                <p
                  style={{
                    margin: "0.375rem 0 0",
                    color: "#475569",
                    fontSize: "0.85rem",
                  }}
                >
                  Try removing a filter.
                </p>
              </div>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                color: "#475569",
                fontSize: "0.72rem",
                justifyContent: "flex-end",
                marginTop: "0.5rem",
              }}
            >
              <Clock size={11} />
              {cacheHit
                ? "Served from cache"
                : `Fetched in ${(product.responseMs / 1000).toFixed(1)}s`}
            </div>
          </div>
        )}
      </main>

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <footer
        style={{
          backgroundColor: WARM.text,
          color: "#fff",
          padding: "4rem 2rem 2.5rem",
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "2.5rem",
              marginBottom: "3rem",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                }}
              >
                <TrendingDown size={18} color="#9C9488" />
                <span
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                  }}
                >
                  SmartScan
                </span>
              </div>
              <p
                style={{
                  color: "#9C9488",
                  fontSize: "0.82rem",
                  lineHeight: 1.7,
                  margin: "0 0 1.5rem",
                }}
              >
                Real-time price comparison across America's biggest retailers.
              </p>
              <button
                onClick={() => setShowRoadmap(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.6rem 1.125rem",
                  backgroundColor: "transparent",
                  border: "1px solid #3A3330",
                  borderRadius: "999px",
                  color: "#9C9488",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <BookOpen size={13} /> What's coming <ChevronRight size={13} />
              </button>
            </div>

            <div>
              <h4
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase" as const,
                  color: "#9C9488",
                  margin: "0 0 1rem",
                }}
              >
                Categories
              </h4>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column" as const,
                  gap: "0.625rem",
                }}
              >
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.label}
                    onClick={() => handleCategory(cat.label)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#6B6560",
                      fontSize: "0.85rem",
                      textAlign: "left" as const,
                      padding: 0,
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.375rem",
                    }}
                  >
                    <ChevronRight size={12} color="#3A3330" /> {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase" as const,
                  color: "#9C9488",
                  margin: "0 0 1rem",
                }}
              >
                Retailers
              </h4>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column" as const,
                  gap: "0.625rem",
                }}
              >
                {Object.entries(STORE_META).map(([store, meta]) => (
                  <span
                    key={store}
                    style={{
                      color: "#6B6560",
                      fontSize: "0.85rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        backgroundColor: meta.color,
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    {store}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h4
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase" as const,
                  color: "#9C9488",
                  margin: "0 0 1rem",
                }}
              >
                API
              </h4>
              <div
                style={{
                  backgroundColor: "#2A2522",
                  borderRadius: "0.625rem",
                  padding: "1rem",
                  border: "1px solid #3A3330",
                }}
              >
                <p
                  style={{
                    margin: "0 0 0.5rem",
                    fontSize: "0.72rem",
                    color: "#9C9488",
                    fontWeight: 600,
                  }}
                >
                  Search endpoint
                </p>
                <code
                  style={{
                    fontSize: "0.72rem",
                    color: "#38bdf8",
                    display: "block",
                    lineHeight: 1.6,
                    wordBreak: "break-all" as const,
                  }}
                >
                  GET /api/search?q=macbook
                </code>
                <p
                  style={{
                    margin: "0.75rem 0 0",
                    fontSize: "0.68rem",
                    color: "#6B6560",
                  }}
                >
                  30 req/min · JSON response · Free
                </p>
              </div>
              <a
                href="/api/health"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  marginTop: "0.75rem",
                  color: "#9C9488",
                  fontSize: "0.78rem",
                  textDecoration: "none",
                }}
              >
                Health status <ExternalLink size={11} />
              </a>
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid #2A2522",
              paddingTop: "1.5rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap" as const,
              gap: "1rem",
            }}
          >
            <p style={{ color: "#6B6560", fontSize: "0.75rem", margin: 0 }}>
              © 2026 SmartScan · Prices update in real time · Always verify on
              retailer site
            </p>
            <div style={{ display: "flex", gap: "1.5rem" }}>
              {[
                "Free to use",
                "Not affiliated with any retailer",
                "Open API",
              ].map((n) => (
                <span key={n} style={{ color: "#6B6560", fontSize: "0.72rem" }}>
                  {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
