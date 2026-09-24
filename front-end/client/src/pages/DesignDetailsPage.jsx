import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../services/apiClient';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import './DesignDetailsPage.css';

// ============================================================
// PRODUCT MAPPING
// ============================================================

const GARMENT_PRODUCT_MAP = {
    TSHIRT: {
        slug: 'oversized-heavyweight-tee',
        names: [
            'oversized heavyweight tee',
            'oversized tee',
            't-shirt',
            'tshirt',
            'tee',
        ],
    },

    SHIRT: {
        slug: 'relaxed-cotton-shirt',
        names: [
            'relaxed cotton shirt',
            'cotton shirt',
            'shirt',
        ],
    },

    JEANS: {
        slug: 'tailored-linen-trousers',
        names: [
            'tailored linen trousers',
            'trousers',
            'pants',
            'jeans',
        ],
    },

    // There is currently no hoodie product in the catalog.
    HOODIE: {
        slug: null,
        names: ['hoodie'],
    },
};

function DesignDetailsPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const { isAuthenticated } = useAuth();

    const {
        addItem,
        isLoading: cartLoading,
    } = useCart();

    const [design, setDesign] = useState(null);
    const [products, setProducts] = useState([]);

    const [selectedVariantId, setSelectedVariantId] =
        useState('');

    const [isLoading, setIsLoading] =
        useState(true);

    const [error, setError] =
        useState(null);

    const [actionMessage, setActionMessage] =
        useState(null);

    const [isAdding, setIsAdding] =
        useState(false);

    // ============================================================
    // LOAD SAVED DESIGN + PRODUCTS
    // ============================================================

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            if (!id) {
                setError(
                    'No design ID was provided.'
                );

                setIsLoading(false);

                return;
            }

            try {
                setIsLoading(true);
                setError(null);

                const designResponse =
                    await apiClient.get(
                        `/custom-designs/${id}`
                    );

                if (cancelled) {
                    return;
                }

                const savedDesign =
                    designResponse.data?.data;

                if (!savedDesign) {
                    throw new Error(
                        'Saved design was not found.'
                    );
                }

                setDesign(savedDesign);

                // ------------------------------------------------
                // Get all products
                // ------------------------------------------------

                const productsResponse =
                    await apiClient.get(
                        '/products'
                    );

                if (cancelled) {
                    return;
                }

                const productData =
                    productsResponse.data?.data;

                let productList = [];

                if (Array.isArray(productData)) {
                    productList =
                        productData;
                } else if (
                    Array.isArray(
                        productData?.products
                    )
                ) {
                    productList =
                        productData.products;
                }

                setProducts(productList);
            } catch (err) {
                console.error(
                    'Error loading design details:',
                    err
                );

                setError(
                    err?.response?.data?.message ||
                    err?.message ||
                    'Unable to load your design.'
                );
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        loadData();

        return () => {
            cancelled = true;
        };
    }, [id]);

    // ============================================================
    // FIND MATCHING PRODUCT
    // ============================================================

    const matchedProduct = useMemo(() => {
        if (
            !design ||
            products.length === 0
        ) {
            return null;
        }

        const garmentType =
            String(
                design.garmentType || ''
            ).toUpperCase();

        const mapping =
            GARMENT_PRODUCT_MAP[
            garmentType
            ];

        if (!mapping) {
            return null;
        }

        // --------------------------------------------------------
        // 1. Exact slug match
        // --------------------------------------------------------

        if (mapping.slug) {
            const exactSlugMatch =
                products.find(
                    (product) =>
                        String(
                            product.slug || ''
                        ).toLowerCase() ===
                        mapping.slug
                );

            if (exactSlugMatch) {
                return exactSlugMatch;
            }
        }

        // --------------------------------------------------------
        // 2. Normalized name / slug matching
        // --------------------------------------------------------

        const normalize = (value) =>
            String(value || '')
                .toLowerCase()
                .replace(
                    /[-_]+/g,
                    ' '
                )
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim();

        const mappedNames =
            mapping.names.map(
                normalize
            );

        const productMatch =
            products.find(
                (product) => {
                    const name =
                        normalize(
                            product.name
                        );

                    const slug =
                        normalize(
                            product.slug
                        );

                    return mappedNames.some(
                        (keyword) =>
                            name.includes(
                                keyword
                            ) ||
                            slug.includes(
                                keyword
                            )
                    );
                }
            );

        return productMatch || null;
    }, [design, products]);

    // ============================================================
    // AVAILABLE VARIANTS
    // ============================================================

    const availableVariants =
        useMemo(() => {
            return (
                matchedProduct?.variants ||
                []
            ).filter(
                (variant) =>
                    Number(
                        variant.inventory
                    ) > 0
            );
        }, [matchedProduct]);

    // ============================================================
    // AUTOMATIC SIZE SELECTION
    // ============================================================

    useEffect(() => {
        if (
            availableVariants.length === 0
        ) {
            setSelectedVariantId('');

            return;
        }

        const selectedStillExists =
            availableVariants.some(
                (variant) =>
                    variant.id ===
                    selectedVariantId
            );

        if (!selectedStillExists) {
            setSelectedVariantId(
                availableVariants[0].id
            );
        }
    }, [
        availableVariants,
        selectedVariantId,
    ]);

    // ============================================================
    // SELECTED VARIANT
    // ============================================================

    const selectedVariant =
        useMemo(() => {
            return availableVariants.find(
                (variant) =>
                    variant.id ===
                    selectedVariantId
            );
        }, [
            availableVariants,
            selectedVariantId,
        ]);

    // ============================================================
    // GENERATED DESIGN IMAGE
    // ============================================================

    const designImage =
        design?.referenceImages?.[0] ||
        null;

    // ============================================================
    // ADD TO CART
    // ============================================================

    const addDesignToCart =
        async () => {
            setActionMessage(null);

            if (!isAuthenticated) {
                navigate('/login', {
                    state: {
                        from: `/designs/${id}`,
                    },
                });

                return false;
            }

            if (!matchedProduct) {
                setActionMessage(
                    'A matching product is not available for this garment.'
                );

                return false;
            }

            if (!selectedVariant) {
                setActionMessage(
                    'Please select an available size.'
                );

                return false;
            }

            try {
                setIsAdding(true);

                const result =
                    await addItem({
                        productId:
                            matchedProduct.id,

                        variantId:
                            selectedVariant.id,

                        quantity: 1,
                    });

                if (
                    !result?.success
                ) {
                    setActionMessage(
                        result?.message ||
                        'Unable to add the design to your cart.'
                    );

                    return false;
                }

                setActionMessage(
                    `${matchedProduct.name} was added to your cart.`
                );

                return true;
            } catch (err) {
                console.error(
                    'Add design to cart error:',
                    err
                );

                setActionMessage(
                    err?.response?.data
                        ?.message ||
                    'Unable to add the design to your cart.'
                );

                return false;
            } finally {
                setIsAdding(false);
            }
        };

    // ============================================================
    // ADD TO CART BUTTON
    // ============================================================

    const handleAddToCart =
        async () => {
            await addDesignToCart();
        };

    // ============================================================
    // BUY NOW BUTTON
    // ============================================================

    const handleBuyNow =
        async () => {
            const success =
                await addDesignToCart();

            if (success) {
                navigate('/cart');
            }
        };

    // ============================================================
    // LOADING
    // ============================================================

    if (isLoading) {
        return (
            <div className="design-details-page">
                <div className="design-details-state">
                    <p>
                        Loading your design…
                    </p>
                </div>
            </div>
        );
    }

    // ============================================================
    // ERROR
    // ============================================================

    if (
        error ||
        !design
    ) {
        return (
            <div className="design-details-page">
                <div className="design-details-state">
                    <span className="design-details-eyebrow">
                        SAVED AI DESIGN
                    </span>

                    <h1>
                        Unable to load your design
                    </h1>

                    <p>
                        {error ||
                            'The requested design could not be found.'}
                    </p>

                    <div className="design-details-state-actions">
                        <button
                            className="design-details-primary-button"
                            onClick={() =>
                                navigate(
                                    '/ai-design'
                                )
                            }
                        >
                            Create New Design
                        </button>

                        <button
                            className="design-details-secondary-button"
                            onClick={() =>
                                navigate(
                                    '/products'
                                )
                            }
                        >
                            Shop Products
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ============================================================
    // MAIN PAGE
    // ============================================================

    return (
        <div className="design-details-page">
            <main className="design-details-container">

                {/* BACK */}

                <button
                    className="design-details-back"
                    onClick={() =>
                        navigate(-1)
                    }
                >
                    ← Back
                </button>

                {/* HEADING */}

                <div className="design-details-heading">
                    <span className="design-details-eyebrow">
                        SAVED AI DESIGN
                    </span>

                    <h1>
                        Your Custom Design
                    </h1>

                    <p>
                        Review your design and
                        choose your size before
                        adding it to your cart.
                    </p>
                </div>

                {/* MAIN GRID */}

                <section className="design-details-grid">

                    {/* ==================================================
                        IMAGE
                    ================================================== */}

                    <div className="design-details-image-panel">
                        <div className="design-details-image-frame">

                            {designImage ? (
                                <img
                                    src={designImage}
                                    alt="AI generated custom design"
                                    className="design-details-image"

                                    onError={(
                                        event
                                    ) => {
                                        event.currentTarget.style.display =
                                            'none';

                                        const fallback =
                                            event
                                                .currentTarget
                                                .parentElement
                                                ?.querySelector(
                                                    '.design-details-image-fallback'
                                                );

                                        if (
                                            fallback
                                        ) {
                                            fallback.style.display =
                                                'flex';
                                        }
                                    }}
                                />
                            ) : null}

                            <div
                                className="design-details-image-fallback"
                                style={{
                                    display:
                                        designImage
                                            ? 'none'
                                            : 'flex',
                                }}
                            >
                                <div>
                                    <span>
                                        ✨
                                    </span>

                                    <p>
                                        Generated design
                                        preview unavailable
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ==================================================
                        DETAILS
                    ================================================== */}

                    <div className="design-details-info">

                        {/* GARMENT */}

                        <section className="design-details-section">
                            <span className="design-details-label">
                                GARMENT
                            </span>

                            <h2>
                                {design.garmentType ||
                                    'CUSTOM GARMENT'}
                            </h2>

                            <p className="design-details-muted">
                                AI customized garment
                            </p>
                        </section>

                        {/* BASE SIZE */}

                        <section className="design-details-section">
                            <span className="design-details-label">
                                BASE SIZE
                            </span>

                            <div className="design-details-row">
                                <span>
                                    Brand
                                </span>

                                <strong>
                                    {design
                                        .baseBrandSize
                                        ?.brand
                                        ?.name ||
                                        '—'}
                                </strong>
                            </div>

                            <div className="design-details-row">
                                <span>
                                    Size
                                </span>

                                <strong>
                                    {design
                                        .baseBrandSize
                                        ?.sizeLabel ||
                                        '—'}
                                </strong>
                            </div>
                        </section>

                        {/* FIT ADJUSTMENTS */}

                        <section className="design-details-section">
                            <span className="design-details-label">
                                FIT ADJUSTMENTS
                            </span>

                            {design
                                .alterations
                                ?.length >
                                0 ? (
                                <div className="design-details-adjustments">
                                    {design.alterations.map(
                                        (
                                            alteration
                                        ) => (
                                            <div
                                                className="design-details-adjustment"
                                                key={
                                                    alteration.id
                                                }
                                            >
                                                <span>
                                                    {alteration
                                                        .measurementType
                                                        ?.label ||
                                                        alteration
                                                            .measurementType
                                                            ?.name ||
                                                        'Measurement'}
                                                </span>

                                                <strong>
                                                    {Number(
                                                        alteration.finalValue
                                                    ).toFixed(
                                                        1
                                                    )}{' '}
                                                    {alteration
                                                        .measurementType
                                                        ?.unit ||
                                                        'inch'}
                                                </strong>
                                            </div>
                                        )
                                    )}
                                </div>
                            ) : (
                                <p className="design-details-muted">
                                    Standard fit — no custom
                                    adjustments.
                                </p>
                            )}
                        </section>

                        {/* ==================================================
                            PRODUCT / SIZE
                        ================================================== */}

                        <section className="design-details-purchase">

                            <span className="design-details-label">
                                SELECT SIZE
                            </span>

                            {matchedProduct ? (
                                <>
                                    <div className="design-details-product-name">
                                        {
                                            matchedProduct.name
                                        }
                                    </div>

                                    <div className="design-details-price">
                                        ₹
                                        {Number(
                                            matchedProduct.price ||
                                            0
                                        ).toLocaleString(
                                            'en-IN'
                                        )}
                                    </div>

                                    {availableVariants.length >
                                        0 ? (
                                        <div className="design-details-size-grid">
                                            {availableVariants.map(
                                                (
                                                    variant
                                                ) => (
                                                    <button
                                                        key={
                                                            variant.id
                                                        }
                                                        type="button"
                                                        className={
                                                            'design-details-size-button' +
                                                            (selectedVariantId ===
                                                                variant.id
                                                                ? ' selected'
                                                                : '')
                                                        }
                                                        onClick={() =>
                                                            setSelectedVariantId(
                                                                variant.id
                                                            )
                                                        }
                                                    >
                                                        {
                                                            variant.size
                                                        }
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    ) : (
                                        <p className="design-details-stock-message">
                                            This product is
                                            currently out
                                            of stock.
                                        </p>
                                    )}

                                    {actionMessage && (
                                        <div className="design-details-action-message">
                                            {
                                                actionMessage
                                            }
                                        </div>
                                    )}

                                    <div className="design-details-buttons">

                                        <button
                                            className="design-details-secondary-action"
                                            onClick={
                                                handleAddToCart
                                            }
                                            disabled={
                                                isAdding ||
                                                cartLoading ||
                                                !selectedVariant
                                            }
                                        >
                                            {isAdding
                                                ? 'Adding…'
                                                : 'Add to Cart'}
                                        </button>

                                        <button
                                            className="design-details-primary-action"
                                            onClick={
                                                handleBuyNow
                                            }
                                            disabled={
                                                isAdding ||
                                                cartLoading ||
                                                !selectedVariant
                                            }
                                        >
                                            Buy Now →
                                        </button>

                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="design-details-stock-message">
                                        {design.garmentType ===
                                            'HOODIE'
                                            ? 'Hoodie products are not available in the current catalog yet.'
                                            : 'A matching catalog product is not available for this garment yet.'}
                                    </p>

                                    <button
                                        className="design-details-secondary-action"
                                        onClick={() =>
                                            navigate(
                                                '/products'
                                            )
                                        }
                                    >
                                        Browse Products
                                    </button>
                                </>
                            )}
                        </section>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default DesignDetailsPage;