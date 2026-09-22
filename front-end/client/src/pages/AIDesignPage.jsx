import { useCallback, useEffect, useRef, useState } from 'react';
import './AIDesignPage.css';
import SizeAdjuster from '../components/size-adjuster/SizeAdjuster';
import apiClient from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';
import GarmentViewer from '../components/3d/GarmentViewer';

// ============================================================
// CONSTANTS — aligned with backend enum
// ============================================================

const GARMENT_TYPES = [
    { label: 'T-Shirt',  enum: 'TSHIRT'  },
    { label: 'Shirt',    enum: 'SHIRT'   },
    { label: 'Hoodie',   enum: 'HOODIE'  },
    { label: 'Jeans',    enum: 'JEANS'   },
];

// ============================================================
// WORKFLOW STEPS
// ============================================================

const STEPS = {
    GARMENT:     0,
    BRAND:       1,
    SIZE:        2,
    MEASUREMENT: 3,
    DESIGN:      4,
    REVIEW:      5,
};

const STEP_LABELS = ['Garment', 'Brand', 'Size', 'Fit', 'Design', 'Review'];

// ============================================================
// INITIAL STATE
// ============================================================

const initialDesignState = {
    // Selection
    garmentTypeEnum:    null,   // 'TSHIRT' | 'SHIRT' | 'HOODIE' | 'JEANS'
    garmentLabel:       null,   // display label

    // Brand / Size from API
    brandId:            null,
    brandName:          null,
    sizeId:             null,
    sizeLabel:          null,
    brandMeasurements:  [],
    alterations:        [],
    adjustments:        {},
    fitConfirmed:       false,

    // Design options
    color:              null,
    fit:                null,
    style:              null,
    design:             null,
    placement:          null,
    creativePrompt:     '',
    referenceImage:     null,   // { file: File, dataUrl: string, name: string }
};

// ============================================================
// COMPONENT
// ============================================================

function AIDesignPage() {
    let user = null;
    try {
        const auth = useAuth();
        user = auth?.user;
    } catch {
        // Fallback if rendered outside AuthProvider
    }

    // ── state ───────────────────────────────────────────────

    const [step, setStep]                     = useState(STEPS.GARMENT);
    const [designState, setDesignState]       = useState(initialDesignState);

    // Brand / Size lists loaded from API
    const [brands, setBrands]                 = useState([]);
    const [brandsLoading, setBrandsLoading]   = useState(false);
    const [brandsError, setBrandsError]       = useState(null);

    const [sizes, setSizes]                   = useState([]);
    const [sizesLoading, setSizesLoading]     = useState(false);
    const [sizesError, setSizesError]         = useState(null);

    const [measLoading, setMeasLoading]       = useState(false);
    const [measError, setMeasError]           = useState(null);

    // Size adjuster panel
    const [showSizeAdjuster, setShowSizeAdjuster] = useState(false);

    // Generation
    const [isGenerating, setIsGenerating]     = useState(false);
    const [generationStep, setGenerationStep] = useState(0);
    const [generationComplete, setGenerationComplete] = useState(false);
    const [generationPayload, setGenerationPayload]   = useState(null);
    const [generationError, setGenerationError]       = useState(null);
    const [generatedImage, setGeneratedImage] = useState(null);

    const referenceInputRef = useRef(null);
    const generationRunRef  = useRef(0);   // lets reset() invalidate an in-flight generation
    const topRef            = useRef(null);

    // ── helpers ─────────────────────────────────────────────

    const update = (patch) => setDesignState((prev) => ({ ...prev, ...patch }));

    const scrollTop = () =>
        topRef.current?.scrollIntoView({ behavior: 'smooth' });

    const goTo = (s) => { setStep(s); scrollTop(); };

    // ── step 0 → 1: garment selected ────────────────────────

    const selectGarment = (g) => {
        update({
            ...initialDesignState,
            garmentTypeEnum: g.enum,
            garmentLabel:    g.label,
        });
        setBrands([]);
        setSizes([]);
        setBrandsError(null);
        setSizesError(null);
        setMeasError(null);
        setShowSizeAdjuster(false);
        goTo(STEPS.BRAND);
    };

    // ── step 1: load brands when entering brand step ─────────

    useEffect(() => {
        if (step !== STEPS.BRAND || !designState.garmentTypeEnum) return;

        setBrandsLoading(true);
        setBrandsError(null);

        apiClient
            .get('/brands')
            .then((res) => {
                const all = res.data?.data || [];
                setBrands(all);
                if (all.length === 0) {
                    setBrandsError('No brands are available for this garment type.');
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
        update({ brandId: brand.id, brandName: brand.name, sizeId: null, sizeLabel: null });
        setSizes([]);
        setSizesError(null);
        goTo(STEPS.SIZE);
    };

    // ── step 2: load sizes when entering size step ───────────

    useEffect(() => {
        if (step !== STEPS.SIZE || !designState.brandId || !designState.garmentTypeEnum) return;

        setSizesLoading(true);
        setSizesError(null);

        apiClient
            .get(`/brands/${designState.brandId}/${designState.garmentTypeEnum}/sizes`)
            .then((res) => {
                const all = res.data?.data || [];
                setSizes(all);
                if (all.length === 0) {
                    setSizesError(`No sizes available for ${designState.brandName}.`);
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
    }, [step, designState.brandId, designState.garmentTypeEnum]);

    // ── step 2 → 3: size selected, load measurements ─────────

    const selectSize = async (size) => {
        update({
            sizeId:           size.id,
            sizeLabel:        size.sizeLabel,
            brandMeasurements: [],
            alterations:      [],
            adjustments:      {},
            fitConfirmed:     false,
        });
        setMeasError(null);
        setShowSizeAdjuster(false);
        setMeasLoading(true);
        goTo(STEPS.MEASUREMENT);

        try {
            const res  = await apiClient.get(`/sizes/${size.id}/measurements`);
            const meas = res.data?.data?.measurements || [];

            if (meas.length === 0) {
                setMeasError(
                    `Measurement data is currently unavailable for ` +
                    `${designState.brandName} ${size.sizeLabel}.`
                );
            } else {
                update({ brandMeasurements: meas });
                setShowSizeAdjuster(true);
            }
        } catch (err) {
            console.error('Measurements fetch error:', err);
            setMeasError(
                err?.response?.data?.message ||
                'Unable to load measurement data. Please try again.'
            );
        } finally {
            setMeasLoading(false);
        }
    };

    // ── step 3: size adjuster save ───────────────────────────

    const handleSizeAdjustmentSave = (adjustments, alterations = []) => {
        update({
            adjustments,
            alterations,
            fitConfirmed: true,
        });
        setShowSizeAdjuster(false);
    };

    const confirmFitAsIs = () => {
        update({ fitConfirmed: true, adjustments: {}, alterations: [] });
    };

    // ── step 3 → 4 ──────────────────────────────────────────

    const goToDesign = () => goTo(STEPS.DESIGN);

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
                    name:    file.name,
                },
            });
        };
        reader.readAsDataURL(file);

        // Reset input so the same file can be re-selected after removal
        e.target.value = '';
    };

    const removeReferenceImage = () => update({ referenceImage: null });

    // ── step 4 → 5: go to review ─────────────────────────────

    const goToReview = () => goTo(STEPS.REVIEW);

    // ── generate design ──────────────────────────────────────

    const handleGenerateDesign = useCallback(async () => {
        const {
            garmentTypeEnum, garmentLabel, brandName, sizeLabel,
            color, fit, style, design, placement,
            creativePrompt, referenceImage,
            adjustments, alterations, brandMeasurements,
        } = designState;

        // Build the structured payload for the future image-generation API
        const payload = {
            garmentType:    garmentTypeEnum,
            garmentLabel,
            brand:          brandName,
            size:           sizeLabel,
            measurements:   brandMeasurements,
            alterations,
            adjustments,
            color,
            fit,
            style,
            design,
            placement,
            creativePrompt: creativePrompt?.trim() || '',
            referenceImage: referenceImage
                ? { name: referenceImage.name, dataUrl: referenceImage.dataUrl }
                : null,
        };

        const runId   = ++generationRunRef.current;
        const isStale = () => runId !== generationRunRef.current;

        setGenerationPayload(payload);
        setGenerationError(null);
        setGeneratedImage(null);
        setIsGenerating(true);
        setGenerationStep(0);
        setGenerationComplete(false);

        // 1) Optional reference-image upload  2) AI generation.
        //    Only garmentType, creativePrompt and (if present) referenceImageUrl are sent to the AI.
        let referenceImageUrl = null;
        let generatedImageUrl = null;
        try {
            if (referenceImage?.file) {
                const formData = new FormData();
                formData.append('image', referenceImage.file);

                const uploadResponse = await apiClient.post(
                    '/reference-images',
                    formData,
                    {
                        headers: {
                            'Content-Type': undefined,
                        },
                    }
                );

                if (!uploadResponse.data?.success || !uploadResponse.data?.referenceImageUrl) {
                    throw new Error('Reference image upload failed. Please try again.');
                }
                referenceImageUrl = uploadResponse.data.referenceImageUrl;
            }
            if (isStale()) return;

            const response = await apiClient.post('/generate-design', {
                garmentType:    garmentTypeEnum,
                creativePrompt: creativePrompt?.trim() || '',
                ...(referenceImageUrl && { referenceImageUrl }),
            });

            if (isStale()) return;
            if (!response.data?.success || (!response.data?.generatedImageUrl && !response.data?.imageBase64)) {
                throw new Error('Design generation failed. Please try again.');
            }

            generatedImageUrl = response.data.generatedImageUrl || (
                'data:' + response.data.mimeType + ';base64,' + response.data.imageBase64
            );

            setGeneratedImage(generatedImageUrl);
            setGenerationComplete(true);
            setIsGenerating(false);
        } catch (err) {
            console.error('Error generating design:', err);
            if (isStale()) return;
            setGenerationError(
                err?.response?.data?.message ||
                (err?.isAxiosError ? null : err?.message) ||
                'Unable to generate your design. Please try again.'
            );
            setIsGenerating(false);
            return; // stop here: nothing is persisted for a failed generation
        }

        // Persist to backend (existing logic preserved)
        try {
            if (garmentTypeEnum && designState.sizeId) {
                const promptStr = [color, fit, style, garmentLabel, design && `with ${design} artwork`]
                    .filter(Boolean)
                    .join(' ');

                await apiClient.post('/custom-designs', {
                    userId:          user?.id || 'demo-user-id',
                    garmentType:     garmentTypeEnum,
                    designPrompt:    creativePrompt?.trim() || promptStr || 'Custom Design',
                    referenceImages: referenceImageUrl
                        ? [referenceImageUrl]
                        : [],
                    generatedImageUrl: generatedImageUrl?.startsWith('/uploads/') ? generatedImageUrl : null,
                    baseBrandSizeId: designState.sizeId,
                    alterations: (alterations || []).map((a) => ({
                        measurementTypeId: a.measurementTypeId,
                        adjustment:        Number(a.adjustment) || 0,
                    })),
                });

                console.log('CustomDesign saved successfully.');
            }
        } catch (err) {
            console.error('Error saving CustomDesign:', err);
        }
    }, [designState, user]);

    // ── generation animation (existing logic preserved) ──────

    useEffect(() => {
        if (!isGenerating) return;

        const steps = [
            'Analyzing your concept...',
            'Applying garment...',
            'Applying color and design...',
            'Applying your selected style...',
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
                // Hold on the final step; handleGenerateDesign sets completion when the API responds.
                clearInterval(interval);
            }
        }, 1200);

        return () => clearInterval(interval);
    }, [isGenerating]);

    // ── reset ────────────────────────────────────────────────

    const reset = () => {
        generationRunRef.current += 1;
        setStep(STEPS.GARMENT);
        setDesignState(initialDesignState);
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
        scrollTop();
    };

    // ── color hex map (preserved) ─────────────────────────────

    const colorHex = {
        black:'#111111', white:'#f5f5f5', red:'#c62828', blue:'#2563eb',
        green:'#16803c', yellow:'#eab308', orange:'#ea580c', purple:'#7c3aed',
        pink:'#ec4899', grey:'#6b7280', brown:'#78350f', beige:'#d6c3a5',
        navy:'#172554', maroon:'#7f1d1d', cream:'#f5f0df',
    };

    // ── design validity check ─────────────────────────────────

    const designComplete =
        Boolean(designState.creativePrompt?.trim());

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
                        (i === step   ? ' workflow-step--active'    : '') +
                        (i < step     ? ' workflow-step--completed' : '') +
                        (i > step     ? ' workflow-step--upcoming'  : '')
                    }
                >
                    <div className="workflow-step-circle">
                        {i < step ? '✓' : i + 1}
                    </div>
                    <span>{label}</span>
                </div>
            ))}
        </div>
    );

    // ── Step 0: Garment ──────────────────────────────────────

    const renderGarmentStep = () => (
        <div className="workflow-panel">
            <h2 className="workflow-panel-title">Select Garment Type</h2>
            <p className="workflow-panel-desc">Choose the type of clothing you want to design.</p>
            <div className="wf-grid wf-grid--2">
                {GARMENT_TYPES.map((g) => (
                    <button
                        key={g.enum}
                        className={
                            'wf-card-btn' +
                            (designState.garmentTypeEnum === g.enum ? ' wf-card-btn--selected' : '')
                        }
                        onClick={() => selectGarment(g)}
                    >
                        <span className="wf-card-btn-label">{g.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );

    // ── Step 1: Brand ────────────────────────────────────────

    const renderBrandStep = () => (
        <div className="workflow-panel">
            <h2 className="workflow-panel-title">Select Brand</h2>
            <p className="workflow-panel-desc">
                Available brands for <strong>{designState.garmentLabel}</strong>:
            </p>

            {brandsLoading && <div className="wf-loading">Loading brands…</div>}

            {brandsError && (
                <div className="wf-error">⚠️ {brandsError}</div>
            )}

            {!brandsLoading && !brandsError && brands.length > 0 && (
                <div className="wf-grid wf-grid--3">
                    {brands.map((b) => (
                        <button
                            key={b.id}
                            className={
                                'wf-card-btn' +
                                (designState.brandId === b.id ? ' wf-card-btn--selected' : '')
                            }
                            onClick={() => selectBrand(b)}
                        >
                            <span className="wf-card-btn-label">{b.name}</span>
                        </button>
                    ))}
                </div>
            )}

            <button className="wf-back-btn" onClick={() => goTo(STEPS.GARMENT)}>
                ← Back
            </button>
        </div>
    );

    // ── Step 2: Size ─────────────────────────────────────────

    const renderSizeStep = () => (
        <div className="workflow-panel">
            <h2 className="workflow-panel-title">Select Size</h2>
            <p className="workflow-panel-desc">
                Available sizes for <strong>{designState.brandName}</strong> {designState.garmentLabel}:
            </p>

            {sizesLoading && <div className="wf-loading">Loading sizes…</div>}

            {sizesError && (
                <div className="wf-error">⚠️ {sizesError}</div>
            )}

            {!sizesLoading && !sizesError && sizes.length > 0 && (
                <div className="wf-grid wf-grid--4">
                    {sizes.map((s) => (
                        <button
                            key={s.id}
                            className={
                                'wf-card-btn wf-size-btn' +
                                (designState.sizeId === s.id ? ' wf-card-btn--selected' : '')
                            }
                            onClick={() => selectSize(s)}
                        >
                            {s.sizeLabel}
                        </button>
                    ))}
                </div>
            )}

            <button className="wf-back-btn" onClick={() => goTo(STEPS.BRAND)}>
                ← Back
            </button>
        </div>
    );

    // ── Step 3: Measurement ──────────────────────────────────

    const renderMeasurementStep = () => (
        <div className="workflow-panel">
            <h2 className="workflow-panel-title">Fit Adjustment</h2>
            <p className="workflow-panel-desc">
                Base fit: <strong>{designState.brandName} — {designState.sizeLabel}</strong>.
                Adjust sliders to fine-tune, or keep the standard measurements.
            </p>

            {measLoading && <div className="wf-loading">Loading measurements…</div>}

            {measError && (
                <div className="wf-error">⚠️ {measError}</div>
            )}

            {!measLoading && !measError && showSizeAdjuster && (
                <SizeAdjuster
                    garmentType={designState.garmentLabel}
                    brandName={designState.brandName}
                    sizeLabel={designState.sizeLabel}
                    measurements={designState.brandMeasurements}
                    initialAdjustments={designState.adjustments}
                    onSave={handleSizeAdjustmentSave}
                />
            )}

            {!measLoading && !measError && designState.brandMeasurements.length > 0 && (
                <div className="wf-fit-actions">
                    {!showSizeAdjuster && !designState.fitConfirmed && (
                        <button
                            className="wf-secondary-btn"
                            onClick={() => setShowSizeAdjuster(true)}
                        >
                            ✎ Adjust Measurements
                        </button>
                    )}

                    {designState.fitConfirmed ? (
                        <div className="wf-confirmed-badge">
                            ✓ Fit confirmed
                            {Object.keys(designState.adjustments).length > 0 && ' (with adjustments)'}
                        </div>
                    ) : (
                        !showSizeAdjuster && (
                            <button className="wf-primary-btn" onClick={confirmFitAsIs}>
                                Use Standard Fit
                            </button>
                        )
                    )}

                    {designState.fitConfirmed && (
                        <button className="wf-primary-btn" onClick={goToDesign}>
                            Continue to Design →
                        </button>
                    )}
                </div>
            )}

            {!measLoading && measError && (
                // Allow skipping measurement when data unavailable
                <div className="wf-fit-actions">
                    <button className="wf-primary-btn" onClick={() => {
                        update({ fitConfirmed: true });
                        goToDesign();
                    }}>
                        Skip & Continue →
                    </button>
                </div>
            )}

            <button className="wf-back-btn" onClick={() => goTo(STEPS.SIZE)}>
                ← Back
            </button>
        </div>
    );

    // ── Step 4: Design ───────────────────────────────────────

    const renderDesignStep = () => (
        <div className="workflow-panel">
            <h2 className="workflow-panel-title">Design Your Garment</h2>
            <p className="workflow-panel-desc">
                Describe your design in your own words, and optionally upload a reference image.
            </p>

            {/* B — Creative prompt */}

            <div className="wf-section-label">Creative Prompt</div>
            <textarea
                className="wf-prompt-textarea"
                rows={8}
                style={{ fontSize: 15 }}
                placeholder="Describe your design — e.g. Create a black futuristic cyberpunk shirt with silver geometric armor-inspired panels, glowing blue accents, and an anime-inspired aesthetic."
                value={designState.creativePrompt}
                onChange={(e) => update({ creativePrompt: e.target.value })}
            />

            {/* C — Reference image */}

            <div className="wf-section-label">Reference Image <span className="wf-optional">(optional)</span></div>

            {designState.referenceImage ? (
                <div className="wf-ref-image-preview">
                    <img
                        src={designState.referenceImage.dataUrl}
                        alt="Reference"
                        className="wf-ref-image"
                    />
                    <div className="wf-ref-image-meta">
                        <span>{designState.referenceImage.name}</span>
                        <button
                            className="wf-remove-img-btn"
                            onClick={removeReferenceImage}
                        >
                            ✕ Remove
                        </button>
                    </div>
                </div>
            ) : (
                <div className="wf-upload-area" onClick={() => referenceInputRef.current?.click()}>
                    <span className="wf-upload-icon">📎</span>
                    <span>Click to upload a reference image</span>
                    <input
                        ref={referenceInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleReferenceImage}
                    />
                </div>
            )}

            {/* Actions */}

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
                    Review Design →
                </button>
            </div>

            <button className="wf-back-btn" onClick={() => goTo(STEPS.MEASUREMENT)}>
                ← Back
            </button>
        </div>
    );

    // ── Step 5: Review ───────────────────────────────────────

    const renderReviewStep = () => {
        const d = designState;

        return (
            <div className="workflow-panel">
                <h2 className="workflow-panel-title">Review Your Design</h2>
                <p className="workflow-panel-desc">
                    Confirm your selections before generating the design.
                </p>

                <div className="wf-review-grid">

                    {/* Garment / Brand / Size */}
                    <div className="wf-review-section">
                        <div className="wf-review-section-title">
                            Garment
                            <button className="wf-edit-link" onClick={() => goTo(STEPS.GARMENT)}>Edit</button>
                        </div>
                        <div className="summary-item"><span>Type</span><strong>{d.garmentLabel}</strong></div>
                        <div className="summary-item"><span>Brand</span><strong>{d.brandName}</strong></div>
                        <div className="summary-item"><span>Size</span><strong>{d.sizeLabel}</strong></div>
                    </div>

                    {/* Fit */}
                    <div className="wf-review-section">
                        <div className="wf-review-section-title">
                            Fit
                            <button className="wf-edit-link" onClick={() => goTo(STEPS.MEASUREMENT)}>Edit</button>
                        </div>
                        <div className="summary-item">
                            <span>Measurements</span>
                            <strong>
                                {d.fitConfirmed
                                    ? Object.keys(d.adjustments).length > 0
                                        ? 'Custom adjusted'
                                        : 'Standard fit'
                                    : 'Not confirmed'}
                            </strong>
                        </div>

                        {d.alterations?.length > 0 && (
    <div className="wf-adjustments-list">
        {d.alterations.map((measurement) => (
            <div
                key={measurement.measurementTypeId || measurement.measurementKey}
                className="summary-item"
            >
                <span>
                    {measurement.label || measurement.measurementKey}
                </span>
                <strong>
                    {Number(measurement.finalValue).toFixed(1)} {measurement.unit || 'cm'}
                </strong>
            </div>
        ))}
    </div>
)}
                    </div>

                    {/* Creative prompt */}
                    <div className="wf-review-section">
                        <div className="wf-review-section-title">
                            Creative Prompt
                            <button className="wf-edit-link" onClick={() => goTo(STEPS.DESIGN)}>Edit</button>
                        </div>
                        <p className="wf-review-prompt">
                            {d.creativePrompt?.trim() || <em>No creative prompt provided.</em>}
                        </p>
                    </div>

                    {/* Reference image */}
                    <div className="wf-review-section">
                        <div className="wf-review-section-title">
                            Reference Image
                            <button className="wf-edit-link" onClick={() => goTo(STEPS.DESIGN)}>Edit</button>
                        </div>
                        {d.referenceImage ? (
                            <div className="wf-ref-review">
                                <img
                                    src={d.referenceImage.dataUrl}
                                    alt="Reference"
                                    className="wf-ref-review-img"
                                />
                                <span>{d.referenceImage.name}</span>
                            </div>
                        ) : (
                            <p className="wf-review-none">None uploaded</p>
                        )}
                    </div>
                </div>

                {generationError && (
                    <div className="wf-error" style={{ marginTop: 24 }}>⚠️ {generationError}</div>
                )}

                {/* Generate button */}
                <div className="wf-fit-actions" style={{ marginTop: 24 }}>
                    <button
                        className="wf-primary-btn wf-generate-btn"
                        disabled={isGenerating}
                        onClick={handleGenerateDesign}
                    >
                        {isGenerating ? 'Generating…' : '✨ Generate Design'}
                    </button>
                </div>

                <button className="wf-back-btn" onClick={() => goTo(STEPS.DESIGN)}>
                    ← Back
                </button>
            </div>
        );
    };

    // ── Generation card (existing UI, preserved) ─────────────

    const renderGenerationCard = () => (
        <div className="workflow-panel">
            <div className="generation-card" style={{ width: '100%' }}>
                <div className="generation-card-title">Creating your design</div>
                <div className="generation-card-subtitle">
                    {[
                        'Analyzing your concept…',
                        'Applying garment…',
                        'Applying color and design…',
                        'Applying your selected style…',
                        'Applying size adjustments…',
                        'Generating your design…',
                    ][generationStep]}
                </div>
                <div className="generation-progress">
                    <div
                        className="generation-progress-bar"
                        style={{ width: `${Math.min(((generationStep + 1) / 6) * 100, 100)}%` }}
                    />
                </div>
                <div className="generation-steps">
                    {['Concept', 'Garment', 'Color', 'Style', 'Size', 'Final'].map((s, i) => (
                        <div key={s} className={`generation-step${i <= generationStep ? ' active' : ''}`}>
                            <span>{i <= generationStep ? '✓' : i + 1}</span>
                            <small>{s}</small>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    // ── Generation complete placeholder ───────────────────────

    const renderGenerationComplete = () => {
        const d = designState;
        // Colour now comes from the creative prompt, not a picker, so use a neutral placeholder tone
        const shirtColor = colorHex[String(d.color || '').toLowerCase()] || colorHex.grey;

        return (
            <div className="workflow-panel">
                <div className="generated-design-card" style={{ width: '100%' }}>
                    <div className="generated-design-header">
                        <div>
                            <span className="generated-design-label">AI GENERATED CONCEPT</span>
                            <h3>Your Design</h3>
                            <p>Design ready — your generated design is ready.</p>
                        </div>
                        <div className="generated-design-status">✓ Ready</div>
                    </div>

                    <div className="generated-design-preview">
                        {/* Generated image (from AI) or SVG garment preview (existing fallback) */}
                        <div className="generated-shirt">
                            {generatedImage ? (
                                <img
                                    className="generated-shirt-svg"
                                    src={generatedImage}
                                    alt="AI generated design"
                                />
                            ) : (
                                <svg viewBox="0 0 400 500" className="generated-shirt-svg">
                                    <ellipse cx="200" cy="465" rx="105" ry="18" fill="#dddddd" />
                                    <path d="M105 100 L35 145 L75 220 L125 190 Z" fill={shirtColor} />
                                    <path d="M295 100 L365 145 L325 220 L275 190 Z" fill={shirtColor} />
                                    <path d="M105 90 Q200 55 295 90 L275 435 Q200 460 125 435 Z" fill={shirtColor} />
                                    <path d="M155 75 Q200 115 245 75 Q230 130 200 132 Q170 130 155 75" fill="#ffffff" opacity="0.15" />
                                    <circle cx="200" cy="230" r="72" fill="#ffffff" opacity="0.1" />
                                    <text x="200" y="220" textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="bold" opacity="0.85">
                                        {d.garmentLabel || 'Design'}
                                    </text>
                                    <text x="200" y="245" textAnchor="middle" fill="#ffffff" fontSize="11" opacity="0.6">
                                        {d.brandName ? `${d.brandName} ${d.sizeLabel || ''}`.trim() : ''}
                                    </text>
                                </svg>
                            )}
                        </div>

                        {/* Interactive 3D garment preview */}
                        <div style={{ marginTop: 24 }}>
                            <div
                                className="generated-design-label"
                                style={{ marginBottom: 12 }}
                            >
                                3D GARMENT PREVIEW
                            </div>

                            <GarmentViewer
                                garmentType={d.garmentTypeEnum}
                                designImageUrl={generatedImage}
                            />
                        </div>

                        {/* Info panel */}
                        <div className="generated-design-info">
                            {[
                                ['Garment', `${d.garmentLabel} — ${d.brandName} ${d.sizeLabel}`],
                                ['Fit', d.fitConfirmed
                                    ? (Object.keys(d.adjustments || {}).length > 0 ? 'Custom adjusted' : 'Standard fit')
                                    : null],
                                ['Reference', d.referenceImage?.name],
                            ].map(([label, val]) => (
                                <div key={label} className="generated-info-row">
                                    <span>{label}</span>
                                    <strong>{val || '—'}</strong>
                                </div>
                            ))}
                            {d.creativePrompt?.trim() && (
                                <div className="generated-info-row">
                                    <span>Prompt</span>
                                    <strong style={{ maxWidth: 260, textAlign: 'right', wordBreak: 'break-word' }}>
                                        {d.creativePrompt}
                                    </strong>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="generated-design-actions">
                        <button className="generated-secondary-button" onClick={reset}>
                            ← Start Over
                        </button>
                        <button
                            className="generated-primary-button"
                            disabled
                            title="Image generation API coming soon"
                        >
                            Download Design (Soon)
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

            {/* ── HEADER ────────────────────────────────────────── */}

            <header className="ai-design-header">
                <div className="ai-brand">
                    <div className="ai-brand-icon">✨</div>
                    <div>
                        <div className="ai-brand-name">AI Design Studio</div>
                        <div className="ai-brand-status">Design your garment</div>
                    </div>
                </div>

                <button className="new-chat-button" onClick={reset}>
                    <span>＋</span> New Design
                </button>
            </header>

            {/* ── MAIN CONTENT ──────────────────────────────────── */}

            <main className="ai-chat-area">
                <div className="messages-container" ref={topRef}>

                    {/* Step progress bar */}
                    {renderStepBar()}

                    {/* Step panels */}
                    {!isGenerating && !generationComplete && step === STEPS.GARMENT     && renderGarmentStep()}
                    {!isGenerating && !generationComplete && step === STEPS.BRAND       && renderBrandStep()}
                    {!isGenerating && !generationComplete && step === STEPS.SIZE        && renderSizeStep()}
                    {!isGenerating && !generationComplete && step === STEPS.MEASUREMENT && renderMeasurementStep()}
                    {!isGenerating && !generationComplete && step === STEPS.DESIGN      && renderDesignStep()}
                    {!isGenerating && !generationComplete && step === STEPS.REVIEW      && renderReviewStep()}

                    {isGenerating          && renderGenerationCard()}
                    {generationComplete    && renderGenerationComplete()}

                </div>
            </main>
        </div>
    );
}

export default AIDesignPage;



