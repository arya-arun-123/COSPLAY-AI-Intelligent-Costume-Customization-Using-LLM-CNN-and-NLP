import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AIDesignPage.css';
import SizeAdjuster from '../components/size-adjuster/SizeAdjuster';
import apiClient from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';
import SaveDesignAuthModal from '../features/auth/components/SaveDesignAuthModal';

// ============================================================
// CONSTANTS — aligned with backend enum
// ============================================================

const GARMENT_TYPES = [
    { label: 'T-Shirt', enum: 'TSHIRT' },
    { label: 'Shirt', enum: 'SHIRT' },
    { label: 'Hoodie', enum: 'HOODIE' },
    { label: 'Jeans', enum: 'JEANS' },
];

// ============================================================
// WORKFLOW STEPS
// ============================================================

const STEPS = {
    GARMENT: 0,
    BRAND: 1,
    SIZE: 2,
    MEASUREMENT: 3,
    DESIGN: 4,
    REVIEW: 5,
};

const STEP_LABELS = [
    'Garment',
    'Brand',
    'Size',
    'Fit',
    'Design',
    'Review',
];

// ============================================================
// INITIAL STATE
// ============================================================

const initialDesignState = {
    // Selection
    garmentTypeEnum: null,
    garmentLabel: null,

    // Brand / Size from API
    brandId: null,
    brandName: null,
    sizeId: null,
    sizeLabel: null,
    brandMeasurements: [],
    alterations: [],
    adjustments: {},
    fitConfirmed: false,

    // Design options
    color: null,
    fit: null,
    style: null,
    design: null,
    placement: null,
    creativePrompt: '',
    referenceImage: null, // { file: File, dataUrl: string, name: string }
};

// ============================================================
// COMPONENT
// ============================================================

function AIDesignPage() {
    const { user, isAuthenticated } = useAuth();
    const navigate = useNavigate();

    // ── state ───────────────────────────────────────────────

    const [step, setStep] = useState(STEPS.GARMENT);
    const [designState, setDesignState] = useState(initialDesignState);

    // Brand / Size lists loaded from API
    const [brands, setBrands] = useState([]);
    const [brandsLoading, setBrandsLoading] = useState(false);
    const [brandsError, setBrandsError] = useState(null);

    const [sizes, setSizes] = useState([]);
    const [sizesLoading, setSizesLoading] = useState(false);
    const [sizesError, setSizesError] = useState(null);

    const [measLoading, setMeasLoading] = useState(false);
    const [measError, setMeasError] = useState(null);

    // Size adjuster panel
    const [showSizeAdjuster, setShowSizeAdjuster] = useState(false);

    // Generation
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationStep, setGenerationStep] = useState(0);
    const [generationComplete, setGenerationComplete] = useState(false);
    const [generationPayload, setGenerationPayload] = useState(null);
    const [generationError, setGenerationError] = useState(null);
    const [generatedImage, setGeneratedImage] = useState(null);
    const [generatedReferenceImageUrl, setGeneratedReferenceImageUrl] = useState(null);
    const [saveWarning, setSaveWarning] = useState(null);
    const [showSaveAuthModal, setShowSaveAuthModal] = useState(false);
    const [isSavingDesign, setIsSavingDesign] = useState(false);
    const [designSaved, setDesignSaved] = useState(false);
    const [savedDesignId, setSavedDesignId] = useState(null);

    // Editing an already-generated design
    const [isEditingGeneratedDesign, setIsEditingGeneratedDesign] = useState(false);

    const referenceInputRef = useRef(null);
    const generationRunRef = useRef(0);
    const topRef = useRef(null);

    // ── helpers ─────────────────────────────────────────────

    const update = (patch) =>
        setDesignState((prev) => ({
            ...prev,
            ...patch,
        }));

    const scrollTop = () =>
        topRef.current?.scrollIntoView({
            behavior: 'smooth',
        });

    const goTo = (s) => {
        setStep(s);
        scrollTop();
    };

    // ── step 0 → 1: garment selected ────────────────────────

    const selectGarment = (g) => {
        update({
            ...initialDesignState,
            garmentTypeEnum: g.enum,
            garmentLabel: g.label,
        });

        setBrands([]);
        setSizes([]);
        setBrandsError(null);
        setSizesError(null);
        setMeasError(null);
        setShowSizeAdjuster(false);

        setIsEditingGeneratedDesign(false);
        setGeneratedImage(null);
        setGenerationComplete(false);
        setGenerationError(null);
        setSaveWarning(null);
        setDesignSaved(false);
        setSavedDesignId(null);

        goTo(STEPS.BRAND);
    };

    // ── step 1: load brands when entering brand step ─────────

    useEffect(() => {
        if (
            step !== STEPS.BRAND ||
            !designState.garmentTypeEnum
        ) {
            return;
        }

        setBrandsLoading(true);
        setBrandsError(null);

        apiClient
            .get('/brands')
            .then((res) => {
                const all = res.data?.data || [];

                setBrands(all);

                if (all.length === 0) {
                    setBrandsError(
                        'No brands are available for this garment type.'
                    );
                }
            })
            .catch((err) => {
                console.error('Brands fetch error:', err);

                setBrandsError(
                    err?.response?.data?.message ||
                    'Unable to load brands. Please try again.'
                );
            })
            .finally(() => setBrandsLoading(false));
    }, [step, designState.garmentTypeEnum]);

    // ── step 1 → 2: brand selected ──────────────────────────

    const selectBrand = (brand) => {
        update({
            brandId: brand.id,
            brandName: brand.name,
            sizeId: null,
            sizeLabel: null,
        });

        setSizes([]);
        setSizesError(null);

        goTo(STEPS.SIZE);
    };

    // ── step 2: load sizes when entering size step ───────────

    useEffect(() => {
        if (
            step !== STEPS.SIZE ||
            !designState.brandId ||
            !designState.garmentTypeEnum
        ) {
            return;
        }

        setSizesLoading(true);
        setSizesError(null);

        apiClient
            .get(
                `/brands/${designState.brandId}/${designState.garmentTypeEnum}/sizes`
            )
            .then((res) => {
                const all = res.data?.data || [];

                setSizes(all);

                if (all.length === 0) {
                    setSizesError(
                        `No sizes available for ${designState.brandName}.`
                    );
                }
            })
            .catch((err) => {
                console.error('Sizes fetch error:', err);

                setSizesError(
                    err?.response?.data?.message ||
                    'Unable to load sizes. Please try again.'
                );
            })
            .finally(() => setSizesLoading(false));
    }, [
        step,
        designState.brandId,
        designState.garmentTypeEnum,
    ]);

    // ── step 2 → 3: size selected, load measurements ─────────

    const selectSize = async (size) => {
        update({
            sizeId: size.id,
            sizeLabel: size.sizeLabel,
            brandMeasurements: [],
            alterations: [],
            adjustments: {},
            fitConfirmed: false,
        });

        setMeasError(null);
        setShowSizeAdjuster(false);
        setMeasLoading(true);

        goTo(STEPS.MEASUREMENT);

        try {
            const res = await apiClient.get(
                `/sizes/${size.id}/measurements`
            );

            const meas =
                res.data?.data?.measurements || [];

            if (meas.length === 0) {
                setMeasError(
                    `Measurement data is currently unavailable for ` +
                    `${designState.brandName} ${size.sizeLabel}.`
                );
            } else {
                update({
                    brandMeasurements: meas,
                });

                setShowSizeAdjuster(true);
            }
        } catch (err) {
            console.error(
                'Measurements fetch error:',
                err
            );

            setMeasError(
                err?.response?.data?.message ||
                'Unable to load measurement data. Please try again.'
            );
        } finally {
            setMeasLoading(false);
        }
    };

    // ── step 3: size adjuster save ───────────────────────────

    const handleSizeAdjustmentSave = (
        adjustments,
        alterations = []
    ) => {
        update({
            adjustments,
            alterations,
            fitConfirmed: true,
        });

        setShowSizeAdjuster(false);
    };

    const confirmFitAsIs = () => {
        update({
            fitConfirmed: true,
            adjustments: {},
            alterations: [],
        });
    };

    // ── step 3 → 4 ──────────────────────────────────────────

    const goToDesign = () =>
        goTo(STEPS.DESIGN);

    // ── reference image ──────────────────────────────────────

    const handleReferenceImage = (e) => {
        const file = e.target.files?.[0];

        if (!file) return;

        const reader = new FileReader();

        reader.onload = (ev) => {
            update({
                referenceImage: {
                    file,
                    dataUrl: ev.target.result,
                    name: file.name,
                },
            });
        };

        reader.readAsDataURL(file);

        // Reset input so the same file can be re-selected
        // after removal/replacement
        e.target.value = '';
    };

    const removeReferenceImage = () => {
        update({
            referenceImage: null,
        });
    };

    // ── step 4 → 5: go to review ─────────────────────────────

    const goToReview = () =>
        goTo(STEPS.REVIEW);

    // ── generate design ──────────────────────────────────────

    const handleGenerateDesign = useCallback(
        async () => {
            const {
                garmentTypeEnum,
                garmentLabel,
                brandName,
                sizeLabel,
                color,
                fit,
                style,
                design,
                placement,
                creativePrompt,
                referenceImage,
                adjustments,
                alterations,
                brandMeasurements,
            } = designState;

            // Build structured payload
            const payload = {
                garmentType: garmentTypeEnum,
                garmentLabel,
                brand: brandName,
                size: sizeLabel,
                measurements: brandMeasurements,
                alterations,
                adjustments,
                color,
                fit,
                style,
                design,
                placement,
                creativePrompt:
                    creativePrompt?.trim() || '',
                referenceImage: referenceImage
                    ? {
                        name: referenceImage.name,
                        dataUrl: referenceImage.dataUrl,
                    }
                    : null,
            };

            const runId =
                ++generationRunRef.current;

            const isStale = () =>
                runId !== generationRunRef.current;

            setGenerationPayload(payload);
            setGenerationError(null);
            setSaveWarning(null);
            setGeneratedImage(null);
            setGeneratedReferenceImageUrl(null);
            setDesignSaved(false);
            setIsGenerating(true);
            setGenerationStep(0);
            setGenerationComplete(false);

            // 1) Optional reference image upload
            // 2) AI generation
            let referenceImageUrl = null;

            try {
                if (referenceImage?.file) {
                    const formData = new FormData();

                    formData.append(
                        'image',
                        referenceImage.file
                    );

                    const uploadResponse =
                        await apiClient.post(
                            '/reference-images',
                            formData,
                            {
                                headers: {
                                    'Content-Type':
                                        undefined,
                                },
                            }
                        );

                    if (
                        !uploadResponse.data?.success ||
                        !uploadResponse.data
                            ?.referenceImageUrl
                    ) {
                        throw new Error(
                            'Reference image upload failed. Please try again.'
                        );
                    }

                    referenceImageUrl =
                        uploadResponse.data
                            .referenceImageUrl;

                    setGeneratedReferenceImageUrl(
                        referenceImageUrl
                    );
                }

                if (isStale()) return;

                const response =
                    await apiClient.post(
                        '/generate-design',
                        {
                            garmentType:
                                garmentTypeEnum,
                            brand: brandName,
                            size: sizeLabel,
                            measurements:
                                brandMeasurements,
                            alterations,
                            adjustments,
                            color,
                            fit,
                            style,
                            design,
                            placement,
                            creativePrompt:
                                creativePrompt
                                    ?.trim() || '',
                            ...(referenceImageUrl && {
                                referenceImageUrl,
                            }),
                        }
                    );

                if (isStale()) return;

                if (
                    !response.data?.success ||
                    !response.data?.imageBase64
                ) {
                    throw new Error(
                        'Design generation failed. Please try again.'
                    );
                }

                const generatedImageUrl =
                    `data:${response.data.mimeType};base64,${response.data.imageBase64}`;

                setGeneratedImage(
                    generatedImageUrl
                );

                setGenerationComplete(true);
                setIsGenerating(false);

                // IMPORTANT:
                // We intentionally do NOT save to /custom-designs
                // here.
                //
                // The new flow is:
                //
                // Generate
                //      ↓
                // Review
                //      ↓
                // Edit if needed
                //      ↓
                // Continue with Design
                //      ↓
                // Login/Register
                //      ↓
                // Save to CustomDesign
            } catch (err) {
                console.error(
                    'Error generating design:',
                    err
                );

                if (isStale()) return;

                setGenerationError(
                    err?.response?.data?.message ||
                    (err?.isAxiosError
                        ? null
                        : err?.message) ||
                    'Unable to generate your design. Please try again.'
                );

                setIsGenerating(false);
                return;
            }
        },
        [designState]
    );

    // ── generation animation ──────────────────────────────────

    useEffect(() => {
        if (!isGenerating) return;

        const steps = [
            'Analyzing your concept...',
            'Applying garment...',
            'Applying color and design...',
            'Applying your selected style...',
            'Applying size adjustments...',
            'Generating your design...',
        ];

        let current = 0;

        setGenerationStep(0);
        setGenerationComplete(false);

        const interval = setInterval(() => {
            current += 1;

            if (current < steps.length) {
                setGenerationStep(current);
            } else {
                clearInterval(interval);
            }
        }, 1200);

        return () =>
            clearInterval(interval);
    }, [isGenerating]);

    // ── edit generated design ─────────────────────────────────

    const handleEditGeneratedDesign = () => {
        // Keep all existing selections:
        // garment, brand, size, measurements,
        // prompt, reference image, etc.

        setIsEditingGeneratedDesign(true);
        setGenerationComplete(false);
        setGenerationError(null);
        setSaveWarning(null);
        setDesignSaved(false);
        setSavedDesignId(null);

        goTo(STEPS.DESIGN);
    };

    // ── save / continue with generated design ──────────────────

    const handleSaveDesign = async () => {
        // AuthContext updates React state after login/register. Reading the
        // persisted user as a fallback prevents a stale user value during
        // the same click that completes authentication.
        let currentUser = user;

        if (!currentUser?.id) {
            try {
                const storedUser =
                    localStorage.getItem('taf_user');

                currentUser = storedUser
                    ? JSON.parse(storedUser)
                    : null;
            } catch {
                currentUser = null;
            }
        }

        if (!currentUser?.id) {
            setSaveWarning(
                'We could not identify your account. Please log in again.'
            );
            return false;
        }

        if (!generatedImage) {
            setSaveWarning(
                'There is no generated design to save yet.'
            );
            return false;
        }

        try {
            setIsSavingDesign(true);
            setSaveWarning(null);

            const {
                garmentTypeEnum,
                creativePrompt,
                sizeId,
                alterations,
            } = designState;

            const response = await apiClient.post('/custom-designs', {
                userId: currentUser.id,
                garmentType: garmentTypeEnum,
                designPrompt:
                    creativePrompt?.trim() ||
                    'Custom AI Design',
                referenceImages: [
                    ...(generatedImage
                        ? [generatedImage]
                        : []),
                    ...(generatedReferenceImageUrl
                        ? [generatedReferenceImageUrl]
                        : []),
                ],
                baseBrandSizeId: sizeId,
                alterations: (alterations || []).map((a) => ({
                    measurementTypeId:
                        a.measurementTypeId,
                    adjustment:
                        Number(a.adjustment) || 0,
                })),
            });

            const savedDesign = response.data?.data;

            if (!savedDesign?.id) {
                throw new Error(
                    'Design was saved, but its ID could not be retrieved.'
                );
            }

            setSavedDesignId(savedDesign.id);
            setDesignSaved(true);
            setShowSaveAuthModal(false);
            setSaveWarning(null);

            return savedDesign.id;
        } catch (err) {
            console.error(
                'Error saving custom design:',
                err
            );

            setSaveWarning(
                err?.response?.data?.message ||
                'Unable to save your design. Please try again.'
            );

            return false;
        } finally {
            setIsSavingDesign(false);
        }
    };

    const handleContinueWithDesign = async () => {
        if (isAuthenticated && user?.id) {
            const designId = await handleSaveDesign();

            if (designId) {
                navigate(`/designs/${designId}`);
            }

            return;
        }

        setShowSaveAuthModal(true);
    };

    // ── reset ─────────────────────────────────────────────────

    const reset = () => {
        generationRunRef.current += 1;

        setStep(STEPS.GARMENT);
        setDesignState(
            initialDesignState
        );

        setBrands([]);
        setSizes([]);

        setBrandsError(null);
        setSizesError(null);
        setMeasError(null);

        setShowSizeAdjuster(false);

        setIsGenerating(false);
        setGenerationStep(0);
        setGenerationComplete(false);
        setGenerationPayload(null);
        setGenerationError(null);
        setGeneratedImage(null);
        setGeneratedReferenceImageUrl(null);
        setSaveWarning(null);
        setShowSaveAuthModal(false);
        setIsSavingDesign(false);
        setDesignSaved(false);
        setSavedDesignId(null);

        setIsEditingGeneratedDesign(false);

        scrollTop();
    };

    // ── color hex map ─────────────────────────────────────────

    const colorHex = {
        black: '#111111',
        white: '#f5f5f5',
        red: '#c62828',
        blue: '#2563eb',
        green: '#16803c',
        yellow: '#eab308',
        orange: '#ea580c',
        purple: '#7c3aed',
        pink: '#ec4899',
        grey: '#6b7280',
        brown: '#78350f',
        beige: '#d6c3a5',
        navy: '#172554',
        maroon: '#7f1d1d',
        cream: '#f5f0df',
    };

    // ── Extract design details from user's prompt ───────────────

    const extractPromptDesignDetails = (prompt = '') => {
        const text = prompt.toLowerCase();

        const colors = [
            'black', 'white', 'red', 'blue', 'green', 'yellow',
            'orange', 'purple', 'pink', 'grey', 'gray', 'brown',
            'beige', 'navy', 'maroon', 'cream', 'burgundy', 'olive',
            'teal', 'cyan', 'silver', 'gold',
        ];

        let detectedColor = null;
        for (const color of colors) {
            if (text.includes(color)) {
                detectedColor = color;
                break;
            }
        }

        let detectedPlacement = null;
        const placementPatterns = [
            { value: 'Back', patterns: ['back print', 'back design', 'on the back', 'on back', 'back graphic', 'back artwork'] },
            { value: 'Front', patterns: ['front print', 'front design', 'on the front', 'on front', 'front graphic', 'front artwork'] },
            { value: 'Left Chest', patterns: ['left chest', 'left-chest', 'left chest print'] },
            { value: 'Right Chest', patterns: ['right chest', 'right-chest', 'right chest print'] },
            { value: 'Sleeve', patterns: ['sleeve print', 'sleeve design', 'on the sleeve', 'sleeve graphic'] },
        ];

        for (const placement of placementPatterns) {
            if (placement.patterns.some((pattern) => text.includes(pattern))) {
                detectedPlacement = placement.value;
                break;
            }
        }

        const styles = [
            { value: 'Streetwear', patterns: ['streetwear', 'street wear'] },
            { value: 'Minimalist', patterns: ['minimalist', 'minimal', 'clean design'] },
            { value: 'Oversized', patterns: ['oversized', 'oversize', 'baggy', 'loose fit'] },
            { value: 'Anime', patterns: ['anime', 'manga'] },
            { value: 'Cyberpunk', patterns: ['cyberpunk', 'cyber punk'] },
            { value: 'Vintage', patterns: ['vintage', 'retro'] },
            { value: 'Graphic', patterns: ['graphic design', 'graphic print', 'graphic'] },
            { value: 'Futuristic', patterns: ['futuristic', 'future'] },
            { value: 'Casual', patterns: ['casual'] },
        ];

        let detectedStyle = null;
        for (const style of styles) {
            if (style.patterns.some((pattern) => text.includes(pattern))) {
                detectedStyle = style.value;
                break;
            }
        }

        return {
            color: detectedColor
                ? detectedColor === 'gray'
                    ? 'Grey'
                    : detectedColor.charAt(0).toUpperCase() + detectedColor.slice(1)
                : null,
            placement: detectedPlacement,
            style: detectedStyle,
        };
    };

    // ── design validity check ─────────────────────────────────

    const designComplete =
        Boolean(
            designState.creativePrompt?.trim()
        );

    // ============================================================
    // RENDER HELPERS
    // ============================================================

    const renderStepBar = () => (
        <div className="workflow-stepbar">
            {STEP_LABELS.map((label, i) => (
                <div
                    key={label}
                    className={
                        'workflow-step' +
                        (i === step
                            ? ' workflow-step--active'
                            : '') +
                        (i < step
                            ? ' workflow-step--completed'
                            : '') +
                        (i > step
                            ? ' workflow-step--upcoming'
                            : '')
                    }
                >
                    <div className="workflow-step-circle">
                        {i < step
                            ? '✓'
                            : i + 1}
                    </div>

                    <span>{label}</span>
                </div>
            ))}
        </div>
    );

    // ── Step 0: Garment ──────────────────────────────────────

    const renderGarmentStep = () => (
        <div className="workflow-panel">
            <h2 className="workflow-panel-title">
                Select Garment Type
            </h2>

            <p className="workflow-panel-desc">
                Choose the type of clothing you want to design.
            </p>

            <div className="wf-grid wf-grid--2">
                {GARMENT_TYPES.map((g) => (
                    <button
                        key={g.enum}
                        className={
                            'wf-card-btn' +
                            (designState.garmentTypeEnum ===
                                g.enum
                                ? ' wf-card-btn--selected'
                                : '')
                        }
                        onClick={() =>
                            selectGarment(g)
                        }
                    >
                        <span className="wf-card-btn-label">
                            {g.label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );

    // ── Step 1: Brand ────────────────────────────────────────

    const renderBrandStep = () => (
        <div className="workflow-panel">
            <h2 className="workflow-panel-title">
                Select Brand
            </h2>

            <p className="workflow-panel-desc">
                Available brands for{' '}
                <strong>
                    {designState.garmentLabel}
                </strong>
                :
            </p>

            {brandsLoading && (
                <div className="wf-loading">
                    Loading brands…
                </div>
            )}

            {brandsError && (
                <div className="wf-error">
                    ⚠️ {brandsError}
                </div>
            )}

            {!brandsLoading &&
                !brandsError &&
                brands.length > 0 && (
                    <div className="wf-grid wf-grid--3">
                        {brands.map((b) => (
                            <button
                                key={b.id}
                                className={
                                    'wf-card-btn' +
                                    (designState.brandId ===
                                        b.id
                                        ? ' wf-card-btn--selected'
                                        : '')
                                }
                                onClick={() =>
                                    selectBrand(b)
                                }
                            >
                                <span className="wf-card-btn-label">
                                    {b.name}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

            <button
                className="wf-back-btn"
                onClick={() =>
                    goTo(STEPS.GARMENT)
                }
            >
                ← Back
            </button>
        </div>
    );

    // ── Step 2: Size ─────────────────────────────────────────

    const renderSizeStep = () => (
        <div className="workflow-panel">
            <h2 className="workflow-panel-title">
                Select Size
            </h2>

            <p className="workflow-panel-desc">
                Available sizes for{' '}
                <strong>
                    {designState.brandName}
                </strong>{' '}
                {designState.garmentLabel}:
            </p>

            {sizesLoading && (
                <div className="wf-loading">
                    Loading sizes…
                </div>
            )}

            {sizesError && (
                <div className="wf-error">
                    ⚠️ {sizesError}
                </div>
            )}

            {!sizesLoading &&
                !sizesError &&
                sizes.length > 0 && (
                    <div className="wf-grid wf-grid--4">
                        {sizes.map((s) => (
                            <button
                                key={s.id}
                                className={
                                    'wf-card-btn wf-size-btn' +
                                    (designState.sizeId ===
                                        s.id
                                        ? ' wf-card-btn--selected'
                                        : '')
                                }
                                onClick={() =>
                                    selectSize(s)
                                }
                            >
                                {s.sizeLabel}
                            </button>
                        ))}
                    </div>
                )}

            <button
                className="wf-back-btn"
                onClick={() =>
                    goTo(STEPS.BRAND)
                }
            >
                ← Back
            </button>
        </div>
    );

    // ── Step 3: Measurement ─────────────────────────────────

    const renderMeasurementStep = () => (
        <div className="workflow-panel">
            <h2 className="workflow-panel-title">
                Fit Adjustment
            </h2>

            <p className="workflow-panel-desc">
                Base fit:{' '}
                <strong>
                    {designState.brandName} —{' '}
                    {designState.sizeLabel}
                </strong>
                . Adjust sliders to fine-tune, or keep the standard measurements.
            </p>

            {measLoading && (
                <div className="wf-loading">
                    Loading measurements…
                </div>
            )}

            {measError && (
                <div className="wf-error">
                    ⚠️ {measError}
                </div>
            )}

            {!measLoading &&
                !measError &&
                showSizeAdjuster && (
                    <SizeAdjuster
                        garmentType={
                            designState.garmentLabel
                        }
                        brandName={
                            designState.brandName
                        }
                        sizeLabel={
                            designState.sizeLabel
                        }
                        measurements={
                            designState.brandMeasurements
                        }
                        initialAdjustments={
                            designState.adjustments
                        }
                        onSave={
                            handleSizeAdjustmentSave
                        }
                    />
                )}

            {!measLoading &&
                !measError &&
                designState.brandMeasurements
                    .length > 0 && (
                    <div className="wf-fit-actions">
                        {!showSizeAdjuster &&
                            !designState.fitConfirmed && (
                                <button
                                    className="wf-secondary-btn"
                                    onClick={() =>
                                        setShowSizeAdjuster(
                                            true
                                        )
                                    }
                                >
                                    ✎ Adjust Measurements
                                </button>
                            )}

                        {designState.fitConfirmed ? (
                            <div className="wf-confirmed-badge">
                                ✓ Fit confirmed
                                {Object.keys(
                                    designState.adjustments
                                ).length > 0 &&
                                    ' (with adjustments)'}
                            </div>
                        ) : (
                            !showSizeAdjuster && (
                                <button
                                    className="wf-primary-btn"
                                    onClick={
                                        confirmFitAsIs
                                    }
                                >
                                    Use Standard Fit
                                </button>
                            )
                        )}

                        {designState.fitConfirmed && (
                            <button
                                className="wf-primary-btn"
                                onClick={
                                    goToDesign
                                }
                            >
                                Continue to Design →
                            </button>
                        )}
                    </div>
                )}

            {!measLoading &&
                measError && (
                    <div className="wf-fit-actions">
                        <button
                            className="wf-primary-btn"
                            onClick={() => {
                                update({
                                    fitConfirmed:
                                        true,
                                });

                                goToDesign();
                            }}
                        >
                            Skip & Continue →
                        </button>
                    </div>
                )}

            <button
                className="wf-back-btn"
                onClick={() =>
                    goTo(STEPS.SIZE)
                }
            >
                ← Back
            </button>
        </div>
    );

    // ── Step 4: Design ───────────────────────────────────────

    const renderDesignStep = () => (
        <div className="workflow-panel">
            <h2 className="workflow-panel-title">
                {isEditingGeneratedDesign
                    ? 'Edit Your Design'
                    : 'Design Your Garment'}
            </h2>

            <p className="workflow-panel-desc">
                {isEditingGeneratedDesign
                    ? 'Modify your prompt or reference image without losing your garment and fit selections.'
                    : 'Describe your design in your own words, and optionally upload a reference image.'}
            </p>

            {isEditingGeneratedDesign && (
                <div
                    className="wf-edit-notice"
                    style={{
                        marginBottom: 20,
                        padding: '12px 16px',
                        borderRadius: 10,
                        background: '#f5f5f5',
                        border: '1px solid #e5e5e5',
                        fontSize: 14,
                    }}
                >
                    ✎ You are editing your generated design.
                    Your garment, brand, size, and fit selections are preserved.
                </div>
            )}

            <div className="wf-section-label">
                Creative Prompt
            </div>

            <textarea
                className="wf-prompt-textarea"
                rows={8}
                style={{ fontSize: 15 }}
                placeholder="Describe your design — e.g. Create a black futuristic cyberpunk shirt with silver geometric armor-inspired panels, glowing blue accents, and an anime-inspired aesthetic."
                value={
                    designState.creativePrompt
                }
                onChange={(e) =>
                    update({
                        creativePrompt:
                            e.target.value,
                    })
                }
            />

            <div className="wf-section-label">
                Reference Image{' '}
                <span className="wf-optional">
                    (optional)
                </span>
            </div>

            {designState.referenceImage ? (
                <div className="wf-ref-image-preview">
                    <img
                        src={
                            designState.referenceImage
                                .dataUrl
                        }
                        alt="Reference"
                        className="wf-ref-image"
                    />

                    <div className="wf-ref-image-meta">
                        <span>
                            {
                                designState
                                    .referenceImage
                                    .name
                            }
                        </span>

                        <button
                            className="wf-remove-img-btn"
                            onClick={
                                removeReferenceImage
                            }
                        >
                            ✕ Remove
                        </button>

                        <button
                            className="wf-secondary-btn"
                            style={{
                                marginLeft: 8,
                            }}
                            onClick={() =>
                                referenceInputRef.current?.click()
                            }
                        >
                            Replace Image
                        </button>
                    </div>

                    <input
                        ref={referenceInputRef}
                        type="file"
                        accept="image/*"
                        style={{
                            display: 'none',
                        }}
                        onChange={
                            handleReferenceImage
                        }
                    />
                </div>
            ) : (
                <div
                    className="wf-upload-area"
                    onClick={() =>
                        referenceInputRef.current?.click()
                    }
                >
                    <span className="wf-upload-icon">
                        📎
                    </span>

                    <span>
                        Click to upload a reference image
                    </span>

                    <input
                        ref={referenceInputRef}
                        type="file"
                        accept="image/*"
                        style={{
                            display: 'none',
                        }}
                        onChange={
                            handleReferenceImage
                        }
                    />
                </div>
            )}

            {!designComplete && (
                <p className="wf-incomplete-note">
                    Describe your design to continue.
                </p>
            )}

            <div className="wf-fit-actions">
                <button
                    className="wf-primary-btn"
                    disabled={!designComplete}
                    onClick={goToReview}
                >
                    {isEditingGeneratedDesign
                        ? 'Review Updated Design →'
                        : 'Review Design →'}
                </button>
            </div>

            <button
                className="wf-back-btn"
                onClick={() => {
                    if (
                        isEditingGeneratedDesign
                    ) {
                        setIsEditingGeneratedDesign(
                            false
                        );

                        setGenerationComplete(
                            true
                        );
                    } else {
                        goTo(
                            STEPS.MEASUREMENT
                        );
                    }
                }}
            >
                ← Back
            </button>
        </div>
    );

    // ── Step 5: Review ───────────────────────────────────────

    const renderReviewStep = () => {
        const d = designState;

        return (
            <div className="workflow-panel">
                <h2 className="workflow-panel-title">
                    Review Your Design
                </h2>

                <p className="workflow-panel-desc">
                    Confirm your selections before generating the design.
                </p>

                <div className="wf-review-grid">

                    {/* Garment */}
                    <div className="wf-review-section">
                        <div className="wf-review-section-title">
                            Garment

                            <button
                                className="wf-edit-link"
                                onClick={() =>
                                    goTo(
                                        STEPS.GARMENT
                                    )
                                }
                            >
                                Edit
                            </button>
                        </div>

                        <div className="summary-item">
                            <span>Type</span>
                            <strong>
                                {d.garmentLabel}
                            </strong>
                        </div>

                        <div className="summary-item">
                            <span>Brand</span>
                            <strong>
                                {d.brandName}
                            </strong>
                        </div>

                        <div className="summary-item">
                            <span>Size</span>
                            <strong>
                                {d.sizeLabel}
                            </strong>
                        </div>
                    </div>

                    {/* Fit */}
                    <div className="wf-review-section">
                        <div className="wf-review-section-title">
                            Fit

                            <button
                                className="wf-edit-link"
                                onClick={() =>
                                    goTo(
                                        STEPS.MEASUREMENT
                                    )
                                }
                            >
                                Edit
                            </button>
                        </div>

                        <div className="summary-item">
                            <span>
                                Measurements
                            </span>

                            <strong>
                                {d.fitConfirmed
                                    ? Object.keys(
                                        d.adjustments
                                    ).length > 0
                                        ? 'Custom adjusted'
                                        : 'Standard fit'
                                    : 'Not confirmed'}
                            </strong>
                        </div>

                        {d.alterations?.length >
                            0 && (
                                <div className="wf-adjustments-list">
                                    {d.alterations.map(
                                        (
                                            measurement
                                        ) => (
                                            <div
                                                key={
                                                    measurement.measurementTypeId ||
                                                    measurement.measurementKey
                                                }
                                                className="summary-item"
                                            >
                                                <span>
                                                    {measurement.label ||
                                                        measurement.measurementKey}
                                                </span>

                                                <strong>
                                                    {Number(
                                                        measurement.finalValue
                                                    ).toFixed(
                                                        1
                                                    )}{' '}
                                                    {measurement.unit ||
                                                        'cm'}
                                                </strong>
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                    </div>

                    {/* Creative Prompt */}
                    <div className="wf-review-section">
                        <div className="wf-review-section-title">
                            Creative Prompt

                            <button
                                className="wf-edit-link"
                                onClick={() =>
                                    goTo(
                                        STEPS.DESIGN
                                    )
                                }
                            >
                                Edit
                            </button>
                        </div>

                        <p className="wf-review-prompt">
                            {d.creativePrompt?.trim() || (
                                <em>
                                    No creative prompt provided.
                                </em>
                            )}
                        </p>
                    </div>

                    {/* Reference Image */}
                    <div className="wf-review-section">
                        <div className="wf-review-section-title">
                            Reference Image

                            <button
                                className="wf-edit-link"
                                onClick={() =>
                                    goTo(
                                        STEPS.DESIGN
                                    )
                                }
                            >
                                Edit
                            </button>
                        </div>

                        {d.referenceImage ? (
                            <div className="wf-ref-review">
                                <img
                                    src={
                                        d.referenceImage
                                            .dataUrl
                                    }
                                    alt="Reference"
                                    className="wf-ref-review-img"
                                />

                                <span>
                                    {
                                        d.referenceImage
                                            .name
                                    }
                                </span>
                            </div>
                        ) : (
                            <p className="wf-review-none">
                                None uploaded
                            </p>
                        )}
                    </div>
                </div>

                {generationError && (
                    <div
                        className="wf-error"
                        style={{
                            marginTop: 24,
                        }}
                    >
                        ⚠️ {generationError}
                    </div>
                )}

                <div
                    className="wf-fit-actions"
                    style={{
                        marginTop: 24,
                    }}
                >
                    <button
                        className="wf-primary-btn wf-generate-btn"
                        disabled={isGenerating}
                        onClick={
                            handleGenerateDesign
                        }
                    >
                        {isGenerating
                            ? 'Generating…'
                            : isEditingGeneratedDesign
                                ? '✨ Generate Updated Design'
                                : '✨ Generate Design'}
                    </button>
                </div>

                <button
                    className="wf-back-btn"
                    onClick={() =>
                        goTo(STEPS.DESIGN)
                    }
                >
                    ← Back
                </button>
            </div>
        );
    };

    // ── Generation card ─────────────────────────────

    const renderGenerationCard = () => (
        <div className="workflow-panel">
            <div
                className="generation-card"
                style={{
                    width: '100%',
                }}
            >
                <div className="generation-card-title">
                    Creating your design
                </div>

                <div className="generation-card-subtitle">
                    {
                        [
                            'Analyzing your concept…',
                            'Applying garment…',
                            'Applying color and design…',
                            'Applying your selected style…',
                            'Applying size adjustments…',
                            'Generating your design…',
                        ][generationStep]
                    }
                </div>

                <div className="generation-progress">
                    <div
                        className="generation-progress-bar"
                        style={{
                            width: `${Math.min(
                                ((generationStep +
                                    1) /
                                    6) *
                                100,
                                100
                            )}%`,
                        }}
                    />
                </div>

                <div className="generation-steps">
                    {[
                        'Concept',
                        'Garment',
                        'Color',
                        'Style',
                        'Size',
                        'Final',
                    ].map((s, i) => (
                        <div
                            key={s}
                            className={`generation-step${i <=
                                generationStep
                                ? ' active'
                                : ''
                                }`}
                        >
                            <span>
                                {i <=
                                    generationStep
                                    ? '✓'
                                    : i + 1}
                            </span>

                            <small>{s}</small>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    // ── Generation complete ───────────────────────────

    const renderGenerationComplete = () => {
        const d = designState;

        const promptDetails = extractPromptDesignDetails(
            d.creativePrompt
        );

        const shirtColor =
            colorHex[
            String(
                d.color || ''
            ).toLowerCase()
            ] || colorHex.grey;

        return (
            <div className="workflow-panel">
                <div
                    className="generated-design-card"
                    style={{
                        width: '100%',
                    }}
                >
                    <div className="generated-design-header">
                        <div>
                            <span className="generated-design-label">
                                AI GENERATED CONCEPT
                            </span>

                            <h3>
                                Your Design
                            </h3>

                            <p>
                                Design ready — your generated design is ready.
                            </p>
                        </div>
                    </div>

                    {saveWarning && (
                        <div
                            className="wf-error"
                            style={{
                                marginBottom: 16,
                            }}
                        >
                            ⚠️ {saveWarning}
                        </div>
                    )}

                    {designSaved && (
                        <div
                            style={{
                                marginBottom: 16,
                                padding: '12px 16px',
                                border: '1px solid #d8d8d8',
                                background: '#fafafa',
                                fontSize: 13,
                                color: '#111111',
                            }}
                        >
                            ✓ Your design has been saved to your account.
                        </div>
                    )}

                    <div className="generated-design-preview">
                        <div className="generated-shirt">
                            {generatedImage ? (
                                <img
                                    className="generated-shirt-svg"
                                    src={generatedImage}
                                    alt="AI generated design"
                                />
                            ) : (
                                <svg
                                    viewBox="0 0 400 500"
                                    className="generated-shirt-svg"
                                >
                                    <ellipse
                                        cx="200"
                                        cy="465"
                                        rx="105"
                                        ry="18"
                                        fill="#dddddd"
                                    />

                                    <path
                                        d="M105 100 L35 145 L75 220 L125 190 Z"
                                        fill={shirtColor}
                                    />

                                    <path
                                        d="M295 100 L365 145 L325 220 L275 190 Z"
                                        fill={shirtColor}
                                    />

                                    <path
                                        d="M105 90 Q200 55 295 90 L275 435 Q200 460 125 435 Z"
                                        fill={shirtColor}
                                    />

                                    <path
                                        d="M155 75 Q200 115 245 75 Q230 130 200 132 Q170 130 155 75"
                                        fill="#ffffff"
                                        opacity="0.15"
                                    />

                                    <circle
                                        cx="200"
                                        cy="230"
                                        r="72"
                                        fill="#ffffff"
                                        opacity="0.1"
                                    />

                                    <text
                                        x="200"
                                        y="220"
                                        textAnchor="middle"
                                        fill="#ffffff"
                                        fontSize="18"
                                        fontWeight="bold"
                                        opacity="0.85"
                                    >
                                        {d.garmentLabel || 'Design'}
                                    </text>

                                    <text
                                        x="200"
                                        y="245"
                                        textAnchor="middle"
                                        fill="#ffffff"
                                        fontSize="11"
                                        opacity="0.6"
                                    >
                                        {d.brandName
                                            ? `${d.brandName} ${d.sizeLabel || ''}`.trim()
                                            : ''}
                                    </text>
                                </svg>
                            )}
                        </div>

                        <div className="generated-design-info">

                            {/* Garment */}
                            <div
                                className="generated-info-row"
                                style={{
                                    borderBottom: 'none',
                                }}
                            >
                                <span>Garment</span>

                                <span
                                    style={{
                                        color: '#111111',
                                        fontWeight: 400,
                                    }}
                                >
                                    {d.garmentLabel || '—'}
                                </span>
                            </div>

                            {/* Fit */}
                            <div
                                className="generated-info-row"
                                style={{
                                    borderBottom: 'none',
                                }}
                            >
                                <span>Fit</span>

                                <span
                                    style={{
                                        color: '#111111',
                                        fontWeight: 400,
                                    }}
                                >
                                    {d.fitConfirmed
                                        ? Object.keys(d.adjustments || {}).length > 0
                                            ? 'Custom adjusted'
                                            : 'Standard fit'
                                        : 'Standard fit'}
                                </span>
                            </div>

                            {/* Reference */}
                            <div
                                className="generated-info-row"
                                style={{
                                    borderBottom: 'none',
                                }}
                            >
                                <span>Reference</span>

                                <span
                                    style={{
                                        color: '#111111',
                                        fontWeight: 400,
                                    }}
                                >
                                    {d.referenceImage
                                        ? 'Uploaded Image'
                                        : 'No reference image'}
                                </span>
                            </div>

                            {/* Design Details */}
                            <div
                                style={{
                                    marginTop: 12,
                                    paddingTop: 18,
                                    borderTop: '1px solid #e5e5e5',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase',
                                        color: '#111111',
                                        marginBottom: 12,
                                    }}
                                >
                                    DESIGN DETAILS
                                </div>

                                {/* Design Type */}
                                <div
                                    className="generated-info-row"
                                    style={{
                                        borderBottom: 'none',
                                    }}
                                >
                                    <span>Design Type</span>

                                    <span
                                        style={{
                                            color: '#111111',
                                            fontWeight: 400,
                                        }}
                                    >
                                        Custom AI Design
                                    </span>
                                </div>

                                {/* Color — taken from user's prompt */}
                                <div
                                    className="generated-info-row"
                                    style={{
                                        borderBottom: 'none',
                                    }}
                                >
                                    <span>Color</span>

                                    <span
                                        style={{
                                            color: '#111111',
                                            fontWeight: 400,
                                        }}
                                    >
                                        {promptDetails.color ||
                                            d.color ||
                                            'Not specified'}
                                    </span>
                                </div>

                                {/* Placement — taken from user's prompt */}
                                <div
                                    className="generated-info-row"
                                    style={{
                                        borderBottom: 'none',
                                    }}
                                >
                                    <span>Placement</span>

                                    <span
                                        style={{
                                            color: '#111111',
                                            fontWeight: 400,
                                        }}
                                    >
                                        {promptDetails.placement ||
                                            d.placement ||
                                            'Not specified'}
                                    </span>
                                </div>

                                {/* Style — taken from user's prompt */}
                                <div
                                    className="generated-info-row"
                                    style={{
                                        borderBottom: 'none',
                                    }}
                                >
                                    <span>Style</span>

                                    <span
                                        style={{
                                            color: '#111111',
                                            fontWeight: 400,
                                        }}
                                    >
                                        {promptDetails.style ||
                                            d.style ||
                                            'Not specified'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* =====================================================
                        GENERATED DESIGN ACTIONS
                       ===================================================== */}

                    <div className="generated-design-actions">

                        <button
                            className="generated-secondary-button"
                            onClick={reset}
                        >
                            ← Start Over
                        </button>

                        <button
                            className="generated-secondary-button"
                            onClick={handleEditGeneratedDesign}
                        >
                            ✎ Edit Design
                        </button>

                        <button
                            className="generated-primary-button"
                            onClick={handleContinueWithDesign}
                            disabled={
                                isSavingDesign ||
                                designSaved
                            }
                        >
                            {isSavingDesign
                                ? 'Saving…'
                                : designSaved
                                    ? 'Design Saved ✓'
                                    : 'Continue with Design →'}
                        </button>

                    </div>
                </div>
            </div>
        );
    };

    // ============================================================
    // MAIN RENDER
    // ============================================================

    return (
        <div className="ai-design-page">

            <header className="ai-design-header">
                <div className="ai-brand">
                    <div className="ai-brand-icon">
                        ✨
                    </div>

                    <div>
                        <div className="ai-brand-name">
                            AI Design Studio
                        </div>

                        <div className="ai-brand-status">
                            Design your garment
                        </div>
                    </div>
                </div>

                <button
                    className="new-chat-button"
                    onClick={reset}
                >
                    <span>＋</span> New Design
                </button>
            </header>

            <main className="ai-chat-area">
                <div
                    className="messages-container"
                    ref={topRef}
                >
                    {renderStepBar()}

                    {!isGenerating &&
                        !generationComplete &&
                        step ===
                        STEPS.GARMENT &&
                        renderGarmentStep()}

                    {!isGenerating &&
                        !generationComplete &&
                        step ===
                        STEPS.BRAND &&
                        renderBrandStep()}

                    {!isGenerating &&
                        !generationComplete &&
                        step ===
                        STEPS.SIZE &&
                        renderSizeStep()}

                    {!isGenerating &&
                        !generationComplete &&
                        step ===
                        STEPS.MEASUREMENT &&
                        renderMeasurementStep()}

                    {!isGenerating &&
                        !generationComplete &&
                        step ===
                        STEPS.DESIGN &&
                        renderDesignStep()}

                    {!isGenerating &&
                        !generationComplete &&
                        step ===
                        STEPS.REVIEW &&
                        renderReviewStep()}

                    {isGenerating &&
                        renderGenerationCard()}

                    {generationComplete &&
                        renderGenerationComplete()}
                </div>
            </main>

            {showSaveAuthModal && (
                <SaveDesignAuthModal
                    onClose={() =>
                        setShowSaveAuthModal(false)
                    }
                    onSuccess={async () => {
                        const designId = await handleSaveDesign();

                        if (designId) {
                            navigate(`/designs/${designId}`);
                        }
                    }}
                />
            )}
        </div>
    );
}

export default AIDesignPage;