import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

import { useNavigate } from 'react-router-dom';
import './AIDesignPage.css';
import SizeAdjuster from '../components/size-adjuster/SizeAdjuster';
import apiClient from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';
import SaveDesignAuthModal from '../features/auth/components/SaveDesignAuthModal';

// ============================================================
// GARMENT TYPES
// ============================================================

const GARMENT_TYPES = [
    {
        label: 'T-Shirt',
        enum: 'TSHIRT',
    },
    {
        label: 'Shirt',
        enum: 'SHIRT',
    },
    {
        label: 'Hoodie',
        enum: 'HOODIE',
    },
    {
        label: 'Jeans',
        enum: 'JEANS',
    },
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
// INITIAL DESIGN STATE
// ============================================================

const initialDesignState = {
    garmentTypeEnum: null,
    garmentLabel: null,

    // Target brand
    brandId: null,
    brandName: null,

    // Target size
    sizeId: null,
    sizeLabel: null,

    // Target brand measurements
    brandMeasurements: [],

    // Size adjustments
    alterations: [],
    adjustments: {},
    fitConfirmed: false,

    // AI size recommendation
    sizeRecommendation: null,
    recommendedSize: null,
    recommendationExplanation: null,
    recommendationSources: [],
    recommendationReference: null,

    // Design options
    color: null,
    fit: 'Regular',
    style: null,
    design: null,
    placement: null,
    creativePrompt: '',
    referenceImage: null,
};

// ============================================================
// COMPONENT
// ============================================================

function AIDesignPage() {
    const { user, isAuthenticated } = useAuth();
    const navigate = useNavigate();

    // ========================================================
    // BASIC WORKFLOW STATE
    // ========================================================

    const [step, setStep] = useState(STEPS.GARMENT);

    const [designState, setDesignState] =
        useState(initialDesignState);

    // ========================================================
    // BRAND STATE
    // ========================================================

    const [brands, setBrands] = useState([]);
    const [brandsLoading, setBrandsLoading] =
        useState(false);
    const [brandsError, setBrandsError] =
        useState(null);

    // ========================================================
    // TARGET SIZE STATE
    // ========================================================

    const [sizes, setSizes] = useState([]);
    const [sizesLoading, setSizesLoading] =
        useState(false);
    const [sizesError, setSizesError] =
        useState(null);

    // ========================================================
    // AI REFERENCE BRAND / SIZE
    // ========================================================

    const [referenceBrandId, setReferenceBrandId] =
        useState('');

    const [referenceSizeId, setReferenceSizeId] =
        useState('');

    const [referenceSizes, setReferenceSizes] =
        useState([]);

    const [referenceSizesLoading, setReferenceSizesLoading] =
        useState(false);

    const [referenceSizesError, setReferenceSizesError] =
        useState(null);

    const [recommendationLoading, setRecommendationLoading] =
        useState(false);

    const [recommendationError, setRecommendationError] =
        useState(null);

    // ========================================================
    // MEASUREMENTS
    // ========================================================

    const [measLoading, setMeasLoading] =
        useState(false);

    const [measError, setMeasError] =
        useState(null);

    // ========================================================
    // SIZE ADJUSTER
    // ========================================================

    const [showSizeAdjuster, setShowSizeAdjuster] =
        useState(false);

    // ========================================================
    // GENERATION
    // ========================================================

    const [isGenerating, setIsGenerating] =
        useState(false);

    const [generationStep, setGenerationStep] =
        useState(0);

    const [generationComplete, setGenerationComplete] =
        useState(false);

    const [generationPayload, setGenerationPayload] =
        useState(null);

    const [generationError, setGenerationError] =
        useState(null);

    const [generatedImage, setGeneratedImage] =
        useState(null);

    const [
        generatedReferenceImageUrl,
        setGeneratedReferenceImageUrl,
    ] = useState(null);

    // ========================================================
    // SAVE
    // ========================================================

    const [saveWarning, setSaveWarning] =
        useState(null);

    const [showSaveAuthModal, setShowSaveAuthModal] =
        useState(false);

    const [isSavingDesign, setIsSavingDesign] =
        useState(false);

    const [designSaved, setDesignSaved] =
        useState(false);

    // ========================================================
    // EDIT GENERATED DESIGN
    // ========================================================

    const [
        isEditingGeneratedDesign,
        setIsEditingGeneratedDesign,
    ] = useState(false);

    // ========================================================
    // REFS
    // ========================================================

    const referenceInputRef = useRef(null);

    const generationRunRef = useRef(0);

    const topRef = useRef(null);

    // ========================================================
    // HELPERS
    // ========================================================

    const update = (patch) => {
        setDesignState((previous) => ({
            ...previous,
            ...patch,
        }));
    };

    const scrollTop = () => {
        topRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        });
    };

    const goTo = (nextStep) => {
        setStep(nextStep);

        setTimeout(() => {
            scrollTop();
        }, 0);
    };

    // ========================================================
    // SELECT GARMENT
    // ========================================================

    const selectGarment = (garment) => {
        setDesignState({
            ...initialDesignState,
            garmentTypeEnum: garment.enum,
            garmentLabel: garment.label,
        });

        setBrands([]);
        setSizes([]);

        setReferenceBrandId('');
        setReferenceSizeId('');
        setReferenceSizes([]);

        setBrandsError(null);
        setSizesError(null);
        setReferenceSizesError(null);
        setRecommendationError(null);
        setMeasError(null);

        setShowSizeAdjuster(false);

        setGeneratedImage(null);
        setGenerationComplete(false);
        setGenerationError(null);
        setGenerationPayload(null);

        setSaveWarning(null);
        setDesignSaved(false);

        setIsEditingGeneratedDesign(false);

        goTo(STEPS.BRAND);
    };

    // ========================================================
    // LOAD BRANDS
    // ========================================================

    useEffect(() => {
        if (
            step !== STEPS.BRAND ||
            !designState.garmentTypeEnum
        ) {
            return;
        }

        let cancelled = false;

        setBrandsLoading(true);
        setBrandsError(null);

        apiClient
            .get('/brands')
            .then((response) => {
                if (cancelled) return;

                const data =
                    response.data?.data || [];

                setBrands(data);

                if (data.length === 0) {
                    setBrandsError(
                        'No brands are available.'
                    );
                }
            })
            .catch((error) => {
                if (cancelled) return;

                console.error(
                    'Brands fetch error:',
                    error
                );

                setBrandsError(
                    error?.response?.data?.message ||
                    'Unable to load brands. Please try again.'
                );
            })
            .finally(() => {
                if (!cancelled) {
                    setBrandsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [
        step,
        designState.garmentTypeEnum,
    ]);

    // ========================================================
    // SELECT TARGET BRAND
    // ========================================================

    const selectBrand = (brand) => {
        update({
            brandId: brand.id,
            brandName: brand.name,

            sizeId: null,
            sizeLabel: null,

            brandMeasurements: [],
            alterations: [],
            adjustments: {},
            fitConfirmed: false,

            sizeRecommendation: null,
            recommendedSize: null,
            recommendationExplanation: null,
            recommendationSources: [],
            recommendationReference: null,
        });

        setSizes([]);
        setSizesError(null);

        setReferenceBrandId('');
        setReferenceSizeId('');
        setReferenceSizes([]);

        setRecommendationError(null);

        goTo(STEPS.SIZE);
    };

    // ========================================================
    // LOAD TARGET SIZES
    // ========================================================

    useEffect(() => {
        if (
            step !== STEPS.SIZE ||
            !designState.brandId ||
            !designState.garmentTypeEnum
        ) {
            return;
        }

        let cancelled = false;

        setSizesLoading(true);
        setSizesError(null);

        apiClient
            .get(
                `/brands/${designState.brandId}/${designState.garmentTypeEnum}/sizes`
            )
            .then((response) => {
                if (cancelled) return;

                const data =
                    response.data?.data || [];

                setSizes(data);

                if (data.length === 0) {
                    setSizesError(
                        `No sizes available for ${designState.brandName}.`
                    );
                }
            })
            .catch((error) => {
                if (cancelled) return;

                console.error(
                    'Target sizes fetch error:',
                    error
                );

                setSizesError(
                    error?.response?.data?.message ||
                    'Unable to load sizes. Please try again.'
                );
            })
            .finally(() => {
                if (!cancelled) {
                    setSizesLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [
        step,
        designState.brandId,
        designState.garmentTypeEnum,
    ]);

    // ========================================================
    // LOAD REFERENCE BRAND SIZES
    // ========================================================

    useEffect(() => {
        if (
            !referenceBrandId ||
            !designState.garmentTypeEnum
        ) {
            setReferenceSizes([]);
            setReferenceSizeId('');
            return;
        }

        let cancelled = false;

        setReferenceSizesLoading(true);
        setReferenceSizesError(null);
        setReferenceSizeId('');

        apiClient
            .get(
                `/brands/${referenceBrandId}/${designState.garmentTypeEnum}/sizes`
            )
            .then((response) => {
                if (cancelled) return;

                const data =
                    response.data?.data || [];

                setReferenceSizes(data);

                if (data.length === 0) {
                    setReferenceSizesError(
                        'No reference sizes are available for this brand and garment.'
                    );
                }
            })
            .catch((error) => {
                if (cancelled) return;

                console.error(
                    'Reference sizes fetch error:',
                    error
                );

                setReferenceSizesError(
                    error?.response?.data?.message ||
                    'Unable to load reference sizes.'
                );
            })
            .finally(() => {
                if (!cancelled) {
                    setReferenceSizesLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [
        referenceBrandId,
        designState.garmentTypeEnum,
    ]);

    // ========================================================
    // LOAD TARGET MEASUREMENTS
    // ========================================================

    const loadMeasurementsForSize = async (
        sizeId,
        sizeLabel
    ) => {
        setMeasError(null);
        setMeasLoading(true);
        setShowSizeAdjuster(false);

        try {
            const response =
                await apiClient.get(
                    `/sizes/${sizeId}/measurements`
                );

            const measurements =
                response.data?.data?.measurements ||
                [];

            if (measurements.length === 0) {
                setMeasError(
                    `Measurement data is unavailable for ${designState.brandName} ${sizeLabel}.`
                );

                update({
                    brandMeasurements: [],
                });

                return false;
            }

            update({
                brandMeasurements: measurements,
            });

            setShowSizeAdjuster(true);

            return true;
        } catch (error) {
            console.error(
                'Measurements fetch error:',
                error
            );

            setMeasError(
                error?.response?.data?.message ||
                'Unable to load measurement data.'
            );

            return false;
        } finally {
            setMeasLoading(false);
        }
    };

    // ========================================================
    // MANUAL SIZE SELECTION
    // ========================================================

    const selectSize = async (size) => {
        update({
            sizeId: size.id,
            sizeLabel: size.sizeLabel,

            brandMeasurements: [],
            alterations: [],
            adjustments: {},
            fitConfirmed: false,

            sizeRecommendation: null,
            recommendedSize: null,
            recommendationExplanation: null,
            recommendationSources: [],
            recommendationReference: null,
        });

        setRecommendationError(null);

        goTo(STEPS.MEASUREMENT);

        await loadMeasurementsForSize(
            size.id,
            size.sizeLabel
        );
    };

    // ========================================================
    // AI SIZE RECOMMENDATION
    //
    // Reference example:
    //
    // User normally wears:
    // Nike Hoodie M
    //
    // Target:
    // Adidas Hoodie
    //
    // Backend:
    // /sizes/recommend-from-reference
    // ========================================================

    const handleAIRecommendation = async () => {
        if (!referenceBrandId) {
            setRecommendationError(
                'Please select the brand whose size you normally wear.'
            );

            return;
        }

        if (!referenceSizeId) {
            setRecommendationError(
                'Please select your usual size.'
            );

            return;
        }

        if (!designState.brandId) {
            setRecommendationError(
                'Please select a target brand first.'
            );

            return;
        }

        if (!designState.garmentTypeEnum) {
            setRecommendationError(
                'Please select a garment first.'
            );

            return;
        }

        if (
            referenceBrandId ===
            designState.brandId
        ) {
            // Same-brand recommendation can still work,
            // but manual selection may be simpler.
        }

        setRecommendationLoading(true);
        setRecommendationError(null);

        try {
            const response = await apiClient.post('/sizes/recommend-from-reference', {
                referenceBrandId,
                referenceSizeId,
                targetBrandId: designState.brandId,
                garment: designState.garmentTypeEnum,
                fit: designState.fit || 'Regular',
            });

            console.log(
                '🔥 AI RECOMMENDATION FULL RESPONSE:',
                response
            );

            const responseBody = response?.data ?? response;

            console.log(
                '🔥 AI RECOMMENDATION RESPONSE BODY:',
                responseBody
            );

            const result =
                responseBody?.data?.recommendedSize
                    ? responseBody.data
                    : responseBody?.recommendedSize
                        ? responseBody
                        : null;

            console.log(
                '🔥 AI RECOMMENDATION RESULT:',
                result
            );

            if (!result?.recommendedSize) {
                console.error(
                    '❌ AI RECOMMENDATION INVALID RESPONSE:',
                    responseBody
                );

                throw new Error(
                    responseBody?.message ||
                    responseBody?.error ||
                    'AI size recommendation returned an unexpected response.'
                );
            }

            const recommendedSize =
                result.recommendedSize;

            const targetSizeId =
                result.targetSizeId;

            if (!targetSizeId) {
                throw new Error(
                    `The AI recommended ${recommendedSize}, but the matching target size was not found.`
                );
            }

            update({
                sizeId: targetSizeId,
                sizeLabel: recommendedSize,

                sizeRecommendation: result,

                recommendedSize,

                recommendationExplanation:
                    result.explanation ||
                    null,

                recommendationSources:
                    result.ragContext ||
                    result.sources ||
                    [],

                recommendationReference:
                    result.reference ||
                    null,

                fit:
                    result.fit ||
                    designState.fit ||
                    'Regular',

                brandMeasurements: [],
                alterations: [],
                adjustments: {},
                fitConfirmed: false,
            });

            // Load measurements for the AI-selected
            // target size.
            const measurementsLoaded =
                await loadMeasurementsForSize(
                    targetSizeId,
                    recommendedSize
                );

            if (!measurementsLoaded) {
                return;
            }

            // Move to Fit step.
            goTo(STEPS.MEASUREMENT);
        } catch (error) {
            console.error(
                'AI size recommendation error:',
                error
            );

            setRecommendationError(
                error?.response?.data?.message ||
                error?.message ||
                'Unable to generate an AI size recommendation.'
            );
        } finally {
            setRecommendationLoading(false);
        }
    };

    // ========================================================
    // SIZE ADJUSTER
    // ========================================================

    const handleSizeAdjustmentSave = (
        adjustments,
        alterations = []
    ) => {
        update({
            adjustments:
                adjustments || {},

            alterations:
                alterations || [],

            fitConfirmed: true,
        });

        setShowSizeAdjuster(false);
    };

    // ========================================================
    // CONFIRM STANDARD FIT
    // ========================================================

    const confirmFitAsIs = () => {
        update({
            fitConfirmed: true,
            adjustments: {},
            alterations: [],
        });

        setShowSizeAdjuster(false);
    };

    // ========================================================
    // GO TO DESIGN
    // ========================================================

    const goToDesign = () => {
        if (!designState.fitConfirmed) {
            return;
        }

        goTo(STEPS.DESIGN);
    };

    // ========================================================
    // REFERENCE IMAGE
    // ========================================================

    const handleReferenceImage = (event) => {
        const file =
            event.target.files?.[0];

        if (!file) {
            return;
        }

        if (!file.type.startsWith('image/')) {
            setSaveWarning(
                'Please select a valid image file.'
            );

            return;
        }

        const reader =
            new FileReader();

        reader.onload = (loadEvent) => {
            update({
                referenceImage: {
                    file,
                    dataUrl:
                        loadEvent.target.result,
                    name: file.name,
                },
            });

            setSaveWarning(null);
        };

        reader.readAsDataURL(file);

        event.target.value = '';
    };

    const removeReferenceImage = () => {
        update({
            referenceImage: null,
        });
    };

    // ========================================================
    // GO TO REVIEW
    // ========================================================

    const goToReview = () => {
        if (
            !designState.creativePrompt?.trim()
        ) {
            return;
        }

        goTo(STEPS.REVIEW);
    };

    // ========================================================
    // GENERATE DESIGN
    // ========================================================

    const handleGenerateDesign =
        useCallback(async () => {
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
                sizeRecommendation,
                recommendedSize,
            } = designState;

            if (!garmentTypeEnum) {
                setGenerationError(
                    'Garment type is missing.'
                );

                return;
            }

            if (!brandName) {
                setGenerationError(
                    'Brand is missing.'
                );

                return;
            }

            if (!sizeLabel) {
                setGenerationError(
                    'Size is missing.'
                );

                return;
            }

            if (
                !creativePrompt?.trim()
            ) {
                setGenerationError(
                    'Please describe your design.'
                );

                return;
            }

            const payload = {
                garmentType:
                    garmentTypeEnum,

                garmentLabel,

                brand:
                    brandName,

                size:
                    sizeLabel,

                measurements:
                    brandMeasurements,

                alterations:
                    alterations || [],

                adjustments:
                    adjustments || {},

                color,

                fit,

                style,

                design,

                placement,

                creativePrompt:
                    creativePrompt.trim(),

                sizeRecommendation:
                    sizeRecommendation
                        ? {
                            recommendedSize,
                            explanation:
                                sizeRecommendation.explanation ||
                                null,
                        }
                        : null,

                referenceImage:
                    referenceImage
                        ? {
                            name:
                                referenceImage.name,

                            dataUrl:
                                referenceImage.dataUrl,
                        }
                        : null,
            };

            const runId =
                ++generationRunRef.current;

            const isStale = () =>
                runId !==
                generationRunRef.current;

            setGenerationPayload(
                payload
            );

            setGenerationError(null);
            setSaveWarning(null);

            setGeneratedImage(null);
            setGeneratedReferenceImageUrl(
                null
            );

            setDesignSaved(false);

            setIsGenerating(true);
            setGenerationStep(0);
            setGenerationComplete(false);

            let referenceImageUrl = null;

            try {
                // ------------------------------------------------
                // UPLOAD REFERENCE IMAGE
                // ------------------------------------------------

                if (
                    referenceImage?.file
                ) {
                    const formData =
                        new FormData();

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
                        !uploadResponse
                            .data
                            ?.success ||
                        !uploadResponse
                            .data
                            ?.referenceImageUrl
                    ) {
                        throw new Error(
                            'Reference image upload failed.'
                        );
                    }

                    referenceImageUrl =
                        uploadResponse
                            .data
                            .referenceImageUrl;

                    setGeneratedReferenceImageUrl(
                        referenceImageUrl
                    );
                }

                if (isStale()) {
                    return;
                }

                // ------------------------------------------------
                // GENERATE DESIGN
                // ------------------------------------------------

                const response =
                    await apiClient.post(
                        '/generate-design',
                        {
                            garmentType:
                                garmentTypeEnum,

                            brand:
                                brandName,

                            size:
                                sizeLabel,

                            measurements:
                                brandMeasurements,

                            alterations:
                                alterations || [],

                            adjustments:
                                adjustments || {},

                            color,

                            fit,

                            style,

                            design,

                            placement,

                            creativePrompt:
                                creativePrompt.trim(),

                            ...(referenceImageUrl && {
                                referenceImageUrl,
                            }),
                        }
                    );

                if (isStale()) {
                    return;
                }

                if (
                    !response
                        .data
                        ?.success ||
                    !response
                        .data
                        ?.imageBase64
                ) {
                    throw new Error(
                        response
                            .data
                            ?.message ||
                        'Design generation failed.'
                    );
                }

                const generatedImageUrl =
                    `data:${response.data.mimeType};base64,${response.data.imageBase64}`;

                setGeneratedImage(
                    generatedImageUrl
                );

                setGenerationComplete(
                    true
                );

                setIsGenerating(false);
            } catch (error) {
                console.error(
                    'Error generating design:',
                    error
                );

                if (isStale()) {
                    return;
                }

                setGenerationError(
                    error?.response?.data
                        ?.message ||
                    error?.message ||
                    'Unable to generate your design. Please try again.'
                );

                setIsGenerating(false);
            }
        }, [designState]);

    // ========================================================
    // GENERATION ANIMATION
    // ========================================================

    useEffect(() => {
        if (!isGenerating) {
            return;
        }

        const animationSteps = [
            'Analyzing your concept...',
            'Applying garment...',
            'Applying color and design...',
            'Applying your selected style...',
            'Applying AI size recommendation...',
            'Generating your design...',
        ];

        let current = 0;

        setGenerationStep(0);
        setGenerationComplete(false);

        const interval =
            setInterval(() => {
                current += 1;

                if (
                    current <
                    animationSteps.length
                ) {
                    setGenerationStep(
                        current
                    );
                } else {
                    clearInterval(
                        interval
                    );
                }
            }, 1200);

        return () =>
            clearInterval(interval);
    }, [isGenerating]);

    // ========================================================
    // EDIT GENERATED DESIGN
    // ========================================================

    const handleEditGeneratedDesign =
        () => {
            setIsEditingGeneratedDesign(
                true
            );

            setGenerationComplete(
                false
            );

            setGenerationError(null);
            setSaveWarning(null);
            setDesignSaved(false);

            goTo(STEPS.DESIGN);
        };

    // ========================================================
    // SAVE DESIGN
    // ========================================================

    const handleSaveDesign = async () => {
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

        if (!designState.sizeId) {
            setSaveWarning(
                'A valid base size is required before saving.'
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

            const response = await apiClient.post(
                '/custom-designs',
                {
                    userId: currentUser.id,

                    garmentType: garmentTypeEnum,

                    designPrompt:
                        creativePrompt?.trim() ||
                        'Custom AI Design',

                    referenceImages:
                        generatedReferenceImageUrl
                            ? [generatedReferenceImageUrl]
                            : [],

                    baseBrandSizeId: sizeId,

                    alterations: (alterations || []).map(
                        (alteration) => ({
                            measurementTypeId:
                                alteration.measurementTypeId,

                            adjustment:
                                Number(
                                    alteration.adjustment
                                ) || 0,
                        })
                    ),
                }
            );

            console.log(
                '✅ DESIGN SAVED RESPONSE:',
                response
            );

            const responseBody =
                response?.data ?? response;

            const savedDesign =
                responseBody?.data ||
                responseBody;

            const savedDesignId =
                savedDesign?.id ||
                savedDesign?.design?.id ||
                savedDesign?.customDesign?.id;

            if (!savedDesignId) {
                console.error(
                    '❌ Design was saved but no design ID was returned:',
                    responseBody
                );

                setDesignSaved(true);
                setSaveWarning(
                    'Design saved successfully, but the saved design page could not be opened because the server did not return a design ID.'
                );

                return true;
            }

            setDesignSaved(true);
            setShowSaveAuthModal(false);
            setSaveWarning(null);

            navigate(`/designs/${savedDesignId}`);

            return true;
        } catch (error) {
            console.error(
                'Error saving custom design:',
                error
            );

            setSaveWarning(
                error?.response?.data?.message ||
                'Unable to save your design. Please try again.'
            );

            return false;
        } finally {
            setIsSavingDesign(false);
        }
    };

    // ========================================================
    // CONTINUE WITH DESIGN
    // ========================================================

    const handleContinueWithDesign =
        async () => {
            if (
                isAuthenticated &&
                user?.id
            ) {
                await handleSaveDesign();

                return;
            }

            setShowSaveAuthModal(
                true
            );
        };

    // ========================================================
    // RESET
    // ========================================================

    const reset = () => {
        generationRunRef.current += 1;

        setStep(
            STEPS.GARMENT
        );

        setDesignState(
            initialDesignState
        );

        setBrands([]);
        setSizes([]);

        setReferenceBrandId('');
        setReferenceSizeId('');
        setReferenceSizes([]);

        setBrandsError(null);
        setSizesError(null);
        setReferenceSizesError(null);
        setRecommendationError(null);
        setMeasError(null);

        setRecommendationLoading(
            false
        );

        setShowSizeAdjuster(
            false
        );

        setIsGenerating(
            false
        );

        setGenerationStep(
            0
        );

        setGenerationComplete(
            false
        );

        setGenerationPayload(
            null
        );

        setGenerationError(
            null
        );

        setGeneratedImage(
            null
        );

        setGeneratedReferenceImageUrl(
            null
        );

        setSaveWarning(
            null
        );

        setShowSaveAuthModal(
            false
        );

        setIsSavingDesign(
            false
        );

        setDesignSaved(
            false
        );

        setIsEditingGeneratedDesign(
            false
        );

        setTimeout(() => {
            scrollTop();
        }, 0);
    };

    // ========================================================
    // COLOR MAP
    // ========================================================

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
        gray: '#6b7280',
        brown: '#78350f',
        beige: '#d6c3a5',
        navy: '#172554',
        maroon: '#7f1d1d',
        cream: '#f5f0df',
    };

    // ========================================================
    // EXTRACT DESIGN DETAILS FROM PROMPT
    // ========================================================

    const extractPromptDesignDetails =
        (prompt = '') => {
            const text =
                prompt.toLowerCase();

            const colors = [
                'black',
                'white',
                'red',
                'blue',
                'green',
                'yellow',
                'orange',
                'purple',
                'pink',
                'grey',
                'gray',
                'brown',
                'beige',
                'navy',
                'maroon',
                'cream',
                'burgundy',
                'olive',
                'teal',
                'cyan',
                'silver',
                'gold',
            ];

            let detectedColor =
                null;

            for (
                const color of colors
            ) {
                if (
                    text.includes(
                        color
                    )
                ) {
                    detectedColor =
                        color;

                    break;
                }
            }

            const placementPatterns =
                [
                    {
                        value: 'Back',
                        patterns: [
                            'back print',
                            'back design',
                            'on the back',
                            'on back',
                            'back graphic',
                            'back artwork',
                        ],
                    },
                    {
                        value: 'Front',
                        patterns: [
                            'front print',
                            'front design',
                            'on the front',
                            'on front',
                            'front graphic',
                            'front artwork',
                        ],
                    },
                    {
                        value: 'Left Chest',
                        patterns: [
                            'left chest',
                            'left-chest',
                            'left chest print',
                        ],
                    },
                    {
                        value: 'Right Chest',
                        patterns: [
                            'right chest',
                            'right-chest',
                            'right chest print',
                        ],
                    },
                    {
                        value: 'Sleeve',
                        patterns: [
                            'sleeve print',
                            'sleeve design',
                            'on the sleeve',
                            'sleeve graphic',
                        ],
                    },
                ];

            let detectedPlacement =
                null;

            for (
                const placement of placementPatterns
            ) {
                if (
                    placement.patterns.some(
                        (pattern) =>
                            text.includes(
                                pattern
                            )
                    )
                ) {
                    detectedPlacement =
                        placement.value;

                    break;
                }
            }

            const styles = [
                {
                    value: 'Streetwear',
                    patterns: [
                        'streetwear',
                        'street wear',
                    ],
                },
                {
                    value: 'Minimalist',
                    patterns: [
                        'minimalist',
                        'minimal',
                        'clean design',
                    ],
                },
                {
                    value: 'Oversized',
                    patterns: [
                        'oversized',
                        'oversize',
                        'baggy',
                        'loose fit',
                    ],
                },
                {
                    value: 'Anime',
                    patterns: [
                        'anime',
                        'manga',
                    ],
                },
                {
                    value: 'Cyberpunk',
                    patterns: [
                        'cyberpunk',
                        'cyber punk',
                    ],
                },
                {
                    value: 'Vintage',
                    patterns: [
                        'vintage',
                        'retro',
                    ],
                },
                {
                    value: 'Graphic',
                    patterns: [
                        'graphic design',
                        'graphic print',
                        'graphic',
                    ],
                },
                {
                    value: 'Futuristic',
                    patterns: [
                        'futuristic',
                        'future',
                    ],
                },
                {
                    value: 'Casual',
                    patterns: [
                        'casual',
                    ],
                },
            ];

            let detectedStyle =
                null;

            for (
                const style of styles
            ) {
                if (
                    style.patterns.some(
                        (pattern) =>
                            text.includes(
                                pattern
                            )
                    )
                ) {
                    detectedStyle =
                        style.value;

                    break;
                }
            }

            return {
                color:
                    detectedColor
                        ? detectedColor ===
                            'gray'
                            ? 'Grey'
                            : detectedColor
                                .charAt(0)
                                .toUpperCase() +
                            detectedColor.slice(
                                1
                            )
                        : null,

                placement:
                    detectedPlacement,

                style:
                    detectedStyle,
            };
        };

    // ========================================================
    // DESIGN VALIDATION
    // ========================================================

    const designComplete =
        Boolean(
            designState.creativePrompt?.trim()
        );

    // ========================================================
    // STEP BAR
    // ========================================================

    const renderStepBar =
        () => (
            <div className="workflow-stepbar">
                {STEP_LABELS.map(
                    (
                        label,
                        index
                    ) => (
                        <div
                            key={label}
                            className={
                                'workflow-step' +
                                (
                                    index ===
                                        step
                                        ? ' workflow-step--active'
                                        : ''
                                ) +
                                (
                                    index <
                                        step
                                        ? ' workflow-step--completed'
                                        : ''
                                ) +
                                (
                                    index >
                                        step
                                        ? ' workflow-step--upcoming'
                                        : ''
                                )
                            }
                        >
                            <div className="workflow-step-circle">
                                {index <
                                    step
                                    ? '✓'
                                    : index +
                                    1}
                            </div>

                            <span>
                                {label}
                            </span>
                        </div>
                    )
                )}
            </div>
        );

    // ========================================================
    // STEP 0 - GARMENT
    // ========================================================

    const renderGarmentStep =
        () => (
            <div className="workflow-panel">
                <h2 className="workflow-panel-title">
                    Select Garment Type
                </h2>

                <p className="workflow-panel-desc">
                    Choose the type of clothing you want to design.
                </p>

                <div className="wf-grid wf-grid--2">
                    {GARMENT_TYPES.map(
                        (garment) => (
                            <button
                                key={
                                    garment.enum
                                }
                                className={
                                    'wf-card-btn' +
                                    (
                                        designState.garmentTypeEnum ===
                                            garment.enum
                                            ? ' wf-card-btn--selected'
                                            : ''
                                    )
                                }
                                onClick={() =>
                                    selectGarment(
                                        garment
                                    )
                                }
                            >
                                <span className="wf-card-btn-label">
                                    {
                                        garment.label
                                    }
                                </span>
                            </button>
                        )
                    )}
                </div>
            </div>
        );

    // ========================================================
    // STEP 1 - BRAND
    // ========================================================

    const renderBrandStep =
        () => (
            <div className="workflow-panel">
                <h2 className="workflow-panel-title">
                    Select Brand
                </h2>

                <p className="workflow-panel-desc">
                    Choose the target brand for your{' '}
                    <strong>
                        {
                            designState.garmentLabel
                        }
                    </strong>
                    .
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
                    brands.length >
                    0 && (
                        <div className="wf-grid wf-grid--3">
                            {brands.map(
                                (brand) => (
                                    <button
                                        key={
                                            brand.id
                                        }
                                        className={
                                            'wf-card-btn' +
                                            (
                                                designState.brandId ===
                                                    brand.id
                                                    ? ' wf-card-btn--selected'
                                                    : ''
                                            )
                                        }
                                        onClick={() =>
                                            selectBrand(
                                                brand
                                            )
                                        }
                                    >
                                        <span className="wf-card-btn-label">
                                            {
                                                brand.name
                                            }
                                        </span>
                                    </button>
                                )
                            )}
                        </div>
                    )}

                <button
                    className="wf-back-btn"
                    onClick={() =>
                        goTo(
                            STEPS.GARMENT
                        )
                    }
                >
                    ← Back
                </button>
            </div>
        );

    // ========================================================
    // STEP 2 - SIZE
    // ========================================================

    const renderSizeStep =
        () => (
            <div className="workflow-panel">
                <h2 className="workflow-panel-title">
                    Select Size
                </h2>

                <p className="workflow-panel-desc">
                    Choose your target size for{' '}
                    <strong>
                        {
                            designState.brandName
                        }
                    </strong>
                    , or let the AI recommend a size based on a brand and size you already wear.
                </p>

                {/* ==========================================
                    AI SIZE RECOMMENDATION
                   ========================================== */}

                <div
                    style={{
                        marginBottom: 28,
                        padding: 20,
                        border: '1px solid #e5e5e5',
                        borderRadius: 12,
                        background: '#fafafa',
                    }}
                >
                    <div
                        style={{
                            fontSize: 13,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            marginBottom: 8,
                        }}
                    >
                        ✨ AI Size Recommendation
                    </div>

                    <p
                        style={{
                            marginTop: 0,
                            marginBottom: 16,
                            fontSize: 14,
                            lineHeight: 1.6,
                            color: '#555',
                        }}
                    >
                        Tell us which brand and size you normally wear. The AI will use the stored brand measurements, RAG sizing information, and Size Engine to recommend the target size.
                    </p>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns:
                                '1fr 1fr',
                            gap: 12,
                            marginBottom: 12,
                        }}
                    >
                        <select
                            value={
                                referenceBrandId
                            }
                            onChange={(
                                event
                            ) => {
                                setReferenceBrandId(
                                    event
                                        .target
                                        .value
                                );

                                setRecommendationError(
                                    null
                                );
                            }}
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: 8,
                                border: '1px solid #d8d8d8',
                                background: '#fff',
                            }}
                        >
                            <option value="">
                                Select your usual brand
                            </option>

                            {brands.map(
                                (brand) => (
                                    <option
                                        key={
                                            brand.id
                                        }
                                        value={
                                            brand.id
                                        }
                                    >
                                        {
                                            brand.name
                                        }
                                    </option>
                                )
                            )}
                        </select>

                        <select
                            value={
                                referenceSizeId
                            }
                            disabled={
                                !referenceBrandId ||
                                referenceSizesLoading
                            }
                            onChange={(
                                event
                            ) => {
                                setReferenceSizeId(
                                    event
                                        .target
                                        .value
                                );

                                setRecommendationError(
                                    null
                                );
                            }}
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: 8,
                                border: '1px solid #d8d8d8',
                                background: '#fff',
                            }}
                        >
                            <option value="">
                                {referenceSizesLoading
                                    ? 'Loading sizes...'
                                    : 'Select your usual size'}
                            </option>

                            {referenceSizes.map(
                                (size) => (
                                    <option
                                        key={
                                            size.id
                                        }
                                        value={
                                            size.id
                                        }
                                    >
                                        {
                                            size.sizeLabel
                                        }
                                    </option>
                                )
                            )}
                        </select>
                    </div>

                    {referenceSizesError && (
                        <div
                            className="wf-error"
                            style={{
                                marginBottom: 12,
                            }}
                        >
                            ⚠️{' '}
                            {
                                referenceSizesError
                            }
                        </div>
                    )}

                    <button
                        className="wf-primary-btn"
                        disabled={
                            recommendationLoading ||
                            !referenceBrandId ||
                            !referenceSizeId
                        }
                        onClick={
                            handleAIRecommendation
                        }
                    >
                        {recommendationLoading
                            ? '✨ Finding Best Size…'
                            : '✨ Recommend My Size'}
                    </button>

                    {recommendationError && (
                        <div
                            className="wf-error"
                            style={{
                                marginTop: 14,
                            }}
                        >
                            ⚠️{' '}
                            {
                                recommendationError
                            }
                        </div>
                    )}

                    {designState.recommendedSize && (
                        <div
                            style={{
                                marginTop: 16,
                                padding: 16,
                                borderRadius: 10,
                                background: '#fff',
                                border: '1px solid #dcdcdc',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 12,
                                    textTransform:
                                        'uppercase',
                                    letterSpacing:
                                        '0.08em',
                                    fontWeight: 700,
                                    marginBottom: 6,
                                }}
                            >
                                AI Recommended Size
                            </div>

                            <div
                                style={{
                                    fontSize: 28,
                                    fontWeight: 700,
                                    marginBottom: 8,
                                }}
                            >
                                {
                                    designState.recommendedSize
                                }
                            </div>

                            {designState.recommendationExplanation && (
                                <p
                                    style={{
                                        margin: 0,
                                        fontSize: 14,
                                        lineHeight: 1.6,
                                        color: '#555',
                                    }}
                                >
                                    {
                                        designState.recommendationExplanation
                                    }
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* ==========================================
                    MANUAL TARGET SIZE
                   ========================================== */}

                <div
                    style={{
                        marginBottom: 14,
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                    }}
                >
                    Or Select Size Manually
                </div>

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
                    sizes.length >
                    0 && (
                        <div className="wf-grid wf-grid--4">
                            {sizes.map(
                                (size) => (
                                    <button
                                        key={
                                            size.id
                                        }
                                        className={
                                            'wf-card-btn wf-size-btn' +
                                            (
                                                designState.sizeId ===
                                                    size.id
                                                    ? ' wf-card-btn--selected'
                                                    : ''
                                            )
                                        }
                                        onClick={() =>
                                            selectSize(
                                                size
                                            )
                                        }
                                    >
                                        {
                                            size.sizeLabel
                                        }
                                    </button>
                                )
                            )}
                        </div>
                    )}

                <button
                    className="wf-back-btn"
                    onClick={() =>
                        goTo(
                            STEPS.BRAND
                        )
                    }
                >
                    ← Back
                </button>
            </div>
        );

    // ========================================================
    // STEP 3 - FIT
    // ========================================================

    const renderMeasurementStep =
        () => (
            <div className="workflow-panel">
                <h2 className="workflow-panel-title">
                    Fit Adjustment
                </h2>

                <p className="workflow-panel-desc">
                    Base fit:{' '}
                    <strong>
                        {
                            designState.brandName
                        }{' '}
                        —{' '}
                        {
                            designState.sizeLabel
                        }
                    </strong>
                    . Adjust the measurements if required, or use the standard fit.
                </p>

                {/* AI recommendation summary */}

                {designState.recommendedSize && (
                    <div
                        style={{
                            marginBottom: 18,
                            padding: 16,
                            borderRadius: 10,
                            border: '1px solid #ddd',
                            background: '#fafafa',
                        }}
                    >
                        <div
                            style={{
                                fontSize: 12,
                                fontWeight: 700,
                                textTransform:
                                    'uppercase',
                                letterSpacing:
                                    '0.08em',
                                marginBottom: 6,
                            }}
                        >
                            ✨ AI Size Recommendation
                        </div>

                        <strong
                            style={{
                                fontSize: 20,
                            }}
                        >
                            {
                                designState.recommendedSize
                            }
                        </strong>

                        {designState.recommendationExplanation && (
                            <p
                                style={{
                                    margin: '8px 0 0',
                                    fontSize: 14,
                                    lineHeight: 1.5,
                                    color: '#555',
                                }}
                            >
                                {
                                    designState.recommendationExplanation
                                }
                            </p>
                        )}
                    </div>
                )}

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
                    designState
                        .brandMeasurements
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
                                        designState.adjustments ||
                                        {}
                                    ).length >
                                        0 &&
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
                        goTo(
                            STEPS.SIZE
                        )
                    }
                >
                    ← Back
                </button>
            </div>
        );

    // ========================================================
    // STEP 4 - DESIGN
    // ========================================================

    const renderDesignStep =
        () => (
            <div className="workflow-panel">
                <h2 className="workflow-panel-title">
                    {isEditingGeneratedDesign
                        ? 'Edit Your Design'
                        : 'Design Your Garment'}
                </h2>

                <p className="workflow-panel-desc">
                    {isEditingGeneratedDesign
                        ? 'Modify your design while keeping your garment, brand, size, and fit selections.'
                        : 'Describe your design in your own words, and optionally upload a reference image.'}
                </p>

                {isEditingGeneratedDesign && (
                    <div
                        style={{
                            marginBottom: 20,
                            padding: '12px 16px',
                            borderRadius: 10,
                            background: '#f5f5f5',
                            border: '1px solid #e5e5e5',
                            fontSize: 14,
                        }}
                    >
                        ✎ You are editing your generated design. Your garment, brand, size, and fit selections are preserved.
                    </div>
                )}

                <div className="wf-section-label">
                    Creative Prompt
                </div>

                <textarea
                    className="wf-prompt-textarea"
                    rows={8}
                    style={{
                        fontSize: 15,
                    }}
                    placeholder="Describe your design — e.g. Create a black futuristic cyberpunk shirt with silver geometric armor-inspired panels, glowing blue accents, and an anime-inspired aesthetic."
                    value={
                        designState.creativePrompt
                    }
                    onChange={(event) =>
                        update({
                            creativePrompt:
                                event
                                    .target
                                    .value,
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
                                designState
                                    .referenceImage
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
                            ref={
                                referenceInputRef
                            }
                            type="file"
                            accept="image/*"
                            style={{
                                display:
                                    'none',
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
                            ref={
                                referenceInputRef
                            }
                            type="file"
                            accept="image/*"
                            style={{
                                display:
                                    'none',
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
                        disabled={
                            !designComplete
                        }
                        onClick={
                            goToReview
                        }
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

    // ========================================================
    // STEP 5 - REVIEW
    // ========================================================

    const renderReviewStep =
        () => {
            const d =
                designState;

            return (
                <div className="workflow-panel">
                    <h2 className="workflow-panel-title">
                        Review Your Design
                    </h2>

                    <p className="workflow-panel-desc">
                        Confirm your selections before generating the design.
                    </p>

                    <div className="wf-review-grid">
                        {/* GARMENT */}

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
                                <span>
                                    Type
                                </span>

                                <strong>
                                    {
                                        d.garmentLabel
                                    }
                                </strong>
                            </div>

                            <div className="summary-item">
                                <span>
                                    Brand
                                </span>

                                <strong>
                                    {
                                        d.brandName
                                    }
                                </strong>
                            </div>

                            <div className="summary-item">
                                <span>
                                    Size
                                </span>

                                <strong>
                                    {
                                        d.sizeLabel
                                    }
                                </strong>
                            </div>
                        </div>

                        {/* AI SIZE */}

                        <div className="wf-review-section">
                            <div className="wf-review-section-title">
                                AI Size Recommendation

                                <button
                                    className="wf-edit-link"
                                    onClick={() =>
                                        goTo(
                                            STEPS.SIZE
                                        )
                                    }
                                >
                                    Edit
                                </button>
                            </div>

                            {d.recommendedSize ? (
                                <>
                                    <div className="summary-item">
                                        <span>
                                            Recommended Size
                                        </span>

                                        <strong>
                                            {
                                                d.recommendedSize
                                            }
                                        </strong>
                                    </div>

                                    {d.recommendationReference && (
                                        <div className="summary-item">
                                            <span>
                                                Reference
                                            </span>

                                            <strong>
                                                {
                                                    d.recommendationReference.brand ||
                                                    'Usual brand'
                                                }
                                                {' '}
                                                {
                                                    d.recommendationReference.size ||
                                                    ''
                                                }
                                            </strong>
                                        </div>
                                    )}

                                    {d.recommendationExplanation && (
                                        <p
                                            style={{
                                                marginTop: 10,
                                                fontSize: 13,
                                                lineHeight: 1.5,
                                                color: '#555',
                                            }}
                                        >
                                            {
                                                d.recommendationExplanation
                                            }
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="wf-review-none">
                                    Manual size selected
                                </p>
                            )}
                        </div>

                        {/* FIT */}

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
                                            d.adjustments ||
                                            {}
                                        ).length >
                                            0
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
                                                alteration,
                                                index
                                            ) => (
                                                <div
                                                    key={
                                                        alteration.measurementTypeId ||
                                                        alteration.measurementKey ||
                                                        index
                                                    }
                                                    className="summary-item"
                                                >
                                                    <span>
                                                        {
                                                            alteration.label ||
                                                            alteration.measurementKey ||
                                                            'Measurement'
                                                        }
                                                    </span>

                                                    <strong>
                                                        {Number(
                                                            alteration.finalValue
                                                        ).toFixed(
                                                            1
                                                        )}{' '}
                                                        {
                                                            alteration.unit ||
                                                            'cm'
                                                        }
                                                    </strong>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                        </div>

                        {/* CREATIVE PROMPT */}

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

                            <p
                                style={{
                                    margin: 0,
                                    lineHeight: 1.6,
                                }}
                            >
                                {
                                    d.creativePrompt
                                }
                            </p>
                        </div>

                        {/* REFERENCE IMAGE */}

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
                            ⚠️{' '}
                            {
                                generationError
                            }
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
                            disabled={
                                isGenerating
                            }
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
                            goTo(
                                STEPS.DESIGN
                            )
                        }
                    >
                        ← Back
                    </button>
                </div>
            );
        };

    // ========================================================
    // GENERATION CARD
    // ========================================================

    const renderGenerationCard =
        () => {
            const generationMessages = [
                'Analyzing your concept…',
                'Applying garment…',
                'Applying color and design…',
                'Applying your selected style…',
                'Applying AI size recommendation…',
                'Generating your design…',
            ];

            const generationLabels = [
                'Concept',
                'Garment',
                'Color',
                'Style',
                'Size',
                'Final',
            ];

            return (
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
                                generationMessages[
                                generationStep
                                ]
                            }
                        </div>

                        <div className="generation-progress">
                            <div
                                className="generation-progress-bar"
                                style={{
                                    width: `${Math.min(
                                        (
                                            (
                                                generationStep +
                                                1
                                            ) /
                                            6
                                        ) *
                                        100,
                                        100
                                    )}%`,
                                }}
                            />
                        </div>

                        <div className="generation-steps">
                            {generationLabels.map(
                                (
                                    label,
                                    index
                                ) => (
                                    <div
                                        key={
                                            label
                                        }
                                        className={
                                            `generation-step${index <=
                                                generationStep
                                                ? ' active'
                                                : ''
                                            }`
                                        }
                                    >
                                        <span>
                                            {index <=
                                                generationStep
                                                ? '✓'
                                                : index +
                                                1}
                                        </span>

                                        <small>
                                            {
                                                label
                                            }
                                        </small>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>
            );
        };

    // ========================================================
    // GENERATED DESIGN
    // ========================================================

    const renderGenerationComplete =
        () => {
            const d =
                designState;

            const promptDetails =
                extractPromptDesignDetails(
                    d.creativePrompt
                );

            const shirtColor =
                colorHex[
                String(
                    d.color ||
                    ''
                ).toLowerCase()
                ] ||
                colorHex.grey;

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
                                    Your AI-generated design is ready.
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
                                ⚠️{' '}
                                {
                                    saveWarning
                                }
                            </div>
                        )}

                        {designSaved && (
                            <div
                                style={{
                                    marginBottom: 16,
                                    padding:
                                        '12px 16px',
                                    border:
                                        '1px solid #d8d8d8',
                                    background:
                                        '#fafafa',
                                    fontSize:
                                        13,
                                    color:
                                        '#111',
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
                                        src={
                                            generatedImage
                                        }
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
                                            fill={
                                                shirtColor
                                            }
                                        />

                                        <path
                                            d="M295 100 L365 145 L325 220 L275 190 Z"
                                            fill={
                                                shirtColor
                                            }
                                        />

                                        <path
                                            d="M105 90 Q200 55 295 90 L275 435 Q200 460 125 435 Z"
                                            fill={
                                                shirtColor
                                            }
                                        />

                                        <text
                                            x="200"
                                            y="220"
                                            textAnchor="middle"
                                            fill="#ffffff"
                                            fontSize="18"
                                            fontWeight="bold"
                                        >
                                            {
                                                d.garmentLabel ||
                                                'Design'
                                            }
                                        </text>

                                        <text
                                            x="200"
                                            y="245"
                                            textAnchor="middle"
                                            fill="#ffffff"
                                            fontSize="11"
                                        >
                                            {d.brandName
                                                ? `${d.brandName} ${d.sizeLabel || ''}`.trim()
                                                : ''}
                                        </text>
                                    </svg>
                                )}
                            </div>

                            <div className="generated-design-info">
                                <div
                                    className="generated-info-row"
                                    style={{
                                        borderBottom:
                                            'none',
                                    }}
                                >
                                    <span>
                                        Garment
                                    </span>

                                    <span
                                        style={{
                                            color:
                                                '#111',
                                            fontWeight:
                                                400,
                                        }}
                                    >
                                        {
                                            d.garmentLabel
                                        }
                                    </span>
                                </div>

                                <div
                                    className="generated-info-row"
                                    style={{
                                        borderBottom:
                                            'none',
                                    }}
                                >
                                    <span>
                                        Brand
                                    </span>

                                    <span
                                        style={{
                                            color:
                                                '#111',
                                            fontWeight:
                                                400,
                                        }}
                                    >
                                        {
                                            d.brandName
                                        }
                                    </span>
                                </div>

                                <div
                                    className="generated-info-row"
                                    style={{
                                        borderBottom:
                                            'none',
                                    }}
                                >
                                    <span>
                                        Size
                                    </span>

                                    <span
                                        style={{
                                            color:
                                                '#111',
                                            fontWeight:
                                                400,
                                        }}
                                    >
                                        {
                                            d.sizeLabel
                                        }

                                        {d.recommendedSize && (
                                            <span
                                                style={{
                                                    marginLeft: 8,
                                                    fontSize: 11,
                                                    padding:
                                                        '3px 7px',
                                                    borderRadius:
                                                        5,
                                                    background:
                                                        '#f0f0f0',
                                                }}
                                            >
                                                AI
                                            </span>
                                        )}
                                    </span>
                                </div>

                                <div
                                    className="generated-info-row"
                                    style={{
                                        borderBottom:
                                            'none',
                                    }}
                                >
                                    <span>
                                        Fit
                                    </span>

                                    <span
                                        style={{
                                            color:
                                                '#111',
                                            fontWeight:
                                                400,
                                        }}
                                    >
                                        {d.fitConfirmed
                                            ? Object.keys(
                                                d.adjustments ||
                                                {}
                                            ).length >
                                                0
                                                ? 'Custom adjusted'
                                                : 'Standard fit'
                                            : 'Standard fit'}
                                    </span>
                                </div>

                                <div
                                    className="generated-info-row"
                                    style={{
                                        borderBottom:
                                            'none',
                                    }}
                                >
                                    <span>
                                        Reference
                                    </span>

                                    <span
                                        style={{
                                            color:
                                                '#111',
                                            fontWeight:
                                                400,
                                        }}
                                    >
                                        {d.referenceImage
                                            ? 'Uploaded Image'
                                            : 'No reference image'}
                                    </span>
                                </div>

                                {/* AI RECOMMENDATION */}

                                {d.recommendedSize && (
                                    <div
                                        style={{
                                            marginTop:
                                                12,
                                            paddingTop:
                                                18,
                                            borderTop:
                                                '1px solid #e5e5e5',
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize:
                                                    12,
                                                fontWeight:
                                                    700,
                                                letterSpacing:
                                                    '0.08em',
                                                textTransform:
                                                    'uppercase',
                                                marginBottom:
                                                    12,
                                            }}
                                        >
                                            AI SIZE RECOMMENDATION
                                        </div>

                                        <div className="generated-info-row">
                                            <span>
                                                Recommended
                                            </span>

                                            <span
                                                style={{
                                                    fontWeight:
                                                        600,
                                                    color:
                                                        '#111',
                                                }}
                                            >
                                                {
                                                    d.recommendedSize
                                                }
                                            </span>
                                        </div>

                                        {d.recommendationExplanation && (
                                            <p
                                                style={{
                                                    margin:
                                                        '10px 0 0',
                                                    fontSize:
                                                        13,
                                                    lineHeight:
                                                        1.5,
                                                    color:
                                                        '#555',
                                                }}
                                            >
                                                {
                                                    d.recommendationExplanation
                                                }
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* DESIGN DETAILS */}

                                <div
                                    style={{
                                        marginTop:
                                            12,
                                        paddingTop:
                                            18,
                                        borderTop:
                                            '1px solid #e5e5e5',
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize:
                                                12,
                                            fontWeight:
                                                700,
                                            letterSpacing:
                                                '0.08em',
                                            textTransform:
                                                'uppercase',
                                            color:
                                                '#111',
                                            marginBottom:
                                                12,
                                        }}
                                    >
                                        DESIGN DETAILS
                                    </div>

                                    <div className="generated-info-row">
                                        <span>
                                            Design Type
                                        </span>

                                        <span>
                                            Custom AI Design
                                        </span>
                                    </div>

                                    <div className="generated-info-row">
                                        <span>
                                            Color
                                        </span>

                                        <span>
                                            {
                                                promptDetails.color ||
                                                d.color ||
                                                'Not specified'
                                            }
                                        </span>
                                    </div>

                                    <div className="generated-info-row">
                                        <span>
                                            Placement
                                        </span>

                                        <span>
                                            {
                                                promptDetails.placement ||
                                                d.placement ||
                                                'Not specified'
                                            }
                                        </span>
                                    </div>

                                    <div className="generated-info-row">
                                        <span>
                                            Style
                                        </span>

                                        <span>
                                            {
                                                promptDetails.style ||
                                                d.style ||
                                                'Not specified'
                                            }
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ACTIONS */}

                        <div className="generated-design-actions">
                            <button
                                className="generated-secondary-button"
                                onClick={
                                    reset
                                }
                            >
                                ← Start Over
                            </button>

                            <button
                                className="generated-secondary-button"
                                onClick={
                                    handleEditGeneratedDesign
                                }
                            >
                                ✎ Edit Design
                            </button>

                            <button
                                className="generated-primary-button"
                                onClick={
                                    handleContinueWithDesign
                                }
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

    // ========================================================
    // MAIN RENDER
    // ========================================================

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
                    onClick={
                        reset
                    }
                >
                    <span>＋</span>{' '}
                    New Design
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
                        setShowSaveAuthModal(
                            false
                        )
                    }
                    onSuccess={
                        handleSaveDesign
                    }
                />
            )}
        </div>
    );
}

export default AIDesignPage;