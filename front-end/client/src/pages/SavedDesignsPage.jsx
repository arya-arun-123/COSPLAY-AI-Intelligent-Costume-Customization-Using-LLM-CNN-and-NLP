import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';
import './SavedDesignsPage.css';

function SavedDesignsPage() {
    const navigate = useNavigate();

    const {
        user,
        isAuthenticated,
    } = useAuth();

    const [designs, setDesigns] =
        useState([]);

    const [isLoading, setIsLoading] =
        useState(true);

    const [error, setError] =
        useState(null);

    // ============================================================
    // LOAD SAVED DESIGNS
    // ============================================================

    useEffect(() => {
        let cancelled = false;

        const loadSavedDesigns =
            async () => {
                if (!isAuthenticated) {
                    setIsLoading(false);
                    return;
                }

                if (!user?.id) {
                    setError(
                        'Unable to identify your account.'
                    );

                    setIsLoading(false);

                    return;
                }

                try {
                    setIsLoading(true);
                    setError(null);

                    const response =
                        await apiClient.get(
                            '/custom-designs',
                            {
                                params: {
                                    userId:
                                        user.id,
                                },
                            }
                        );

                    if (cancelled) {
                        return;
                    }

                    const data =
                        response.data?.data;

                    setDesigns(
                        Array.isArray(data)
                            ? data
                            : []
                    );
                } catch (err) {
                    console.error(
                        'Error loading saved designs:',
                        err
                    );

                    if (!cancelled) {
                        setError(
                            err?.response?.data
                                ?.message ||
                            'Unable to load your saved designs.'
                        );
                    }
                } finally {
                    if (!cancelled) {
                        setIsLoading(false);
                    }
                }
            };

        loadSavedDesigns();

        return () => {
            cancelled = true;
        };
    }, [
        user?.id,
        isAuthenticated,
    ]);

    // ============================================================
    // NOT LOGGED IN
    // ============================================================

    if (!isAuthenticated) {
        return (
            <div className="saved-designs-page">
                <main className="saved-designs-container">
                    <div className="saved-designs-empty">
                        <span className="saved-designs-eyebrow">
                            SAVED AI DESIGNS
                        </span>

                        <h1>
                            Your Designs
                        </h1>

                        <p>
                            Log in to view the
                            designs you have saved.
                        </p>

                        <button
                            className="saved-designs-primary-button"
                            onClick={() =>
                                navigate(
                                    '/login',
                                    {
                                        state: {
                                            from:
                                                '/saved-designs',
                                        },
                                    }
                                )
                            }
                        >
                            Log In
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    // ============================================================
    // LOADING
    // ============================================================

    if (isLoading) {
        return (
            <div className="saved-designs-page">
                <main className="saved-designs-container">
                    <div className="saved-designs-loading">
                        Loading your saved designs…
                    </div>
                </main>
            </div>
        );
    }

    // ============================================================
    // ERROR
    // ============================================================

    if (error) {
        return (
            <div className="saved-designs-page">
                <main className="saved-designs-container">
                    <div className="saved-designs-empty">
                        <span className="saved-designs-eyebrow">
                            SAVED AI DESIGNS
                        </span>

                        <h1>
                            Something went wrong
                        </h1>

                        <p>
                            {error}
                        </p>

                        <button
                            className="saved-designs-primary-button"
                            onClick={() =>
                                window.location.reload()
                            }
                        >
                            Try Again
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    // ============================================================
    // EMPTY STATE
    // ============================================================

    if (designs.length === 0) {
        return (
            <div className="saved-designs-page">
                <main className="saved-designs-container">

                    <div className="saved-designs-heading">
                        <span className="saved-designs-eyebrow">
                            SAVED AI DESIGNS
                        </span>

                        <h1>
                            Your Designs
                        </h1>

                        <p>
                            Your saved AI clothing
                            designs will appear here.
                        </p>
                    </div>

                    <div className="saved-designs-empty">
                        <div className="saved-designs-empty-icon">
                            ✨
                        </div>

                        <h2>
                            No saved designs yet
                        </h2>

                        <p>
                            Create your first
                            personalized AI design
                            and save it here.
                        </p>

                        <button
                            className="saved-designs-primary-button"
                            onClick={() =>
                                navigate(
                                    '/ai-design'
                                )
                            }
                        >
                            Create New Design
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    // ============================================================
    // DESIGN CARD
    // ============================================================

    const renderDesignCard =
        (design) => {
            const image =
                design
                    ?.referenceImages?.[0];

            const garment =
                design?.garmentType ||
                'CUSTOM DESIGN';

            const brand =
                design
                    ?.baseBrandSize
                    ?.brand
                    ?.name;

            const size =
                design
                    ?.baseBrandSize
                    ?.sizeLabel;

            const createdDate =
                design?.createdAt
                    ? new Date(
                        design.createdAt
                    ).toLocaleDateString(
                        'en-IN',
                        {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                        }
                    )
                    : null;

            return (
                <article
                    key={design.id}
                    className="saved-design-card"
                >
                    <button
                        type="button"
                        className="saved-design-image-button"
                        onClick={() =>
                            navigate(
                                `/designs/${design.id}`
                            )
                        }
                    >
                        {image ? (
                            <img
                                src={image}
                                alt={`${garment} AI design`}
                                className="saved-design-image"
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
                                                '.saved-design-image-fallback'
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
                            className="saved-design-image-fallback"
                            style={{
                                display: image
                                    ? 'none'
                                    : 'flex',
                            }}
                        >
                            <span>
                                ✨
                            </span>

                            <small>
                                Design preview
                            </small>
                        </div>
                    </button>

                    <div className="saved-design-card-content">

                        <div className="saved-design-card-top">
                            <span className="saved-design-card-label">
                                AI DESIGN
                            </span>

                            <span className="saved-design-card-date">
                                {createdDate}
                            </span>
                        </div>

                        <h2>
                            {garment}
                        </h2>

                        <p>
                            {brand
                                ? `${brand} · ${size || 'Custom size'}`
                                : 'Custom AI garment'}
                        </p>

                        <button
                            type="button"
                            className="saved-design-view-button"
                            onClick={() =>
                                navigate(
                                    `/designs/${design.id}`
                                )
                            }
                        >
                            View Design →
                        </button>
                    </div>
                </article>
            );
        };

    // ============================================================
    // MAIN
    // ============================================================

    return (
        <div className="saved-designs-page">
            <main className="saved-designs-container">

                <header className="saved-designs-heading">
                    <span className="saved-designs-eyebrow">
                        SAVED AI DESIGNS
                    </span>

                    <div className="saved-designs-title-row">
                        <div>
                            <h1>
                                Your Designs
                            </h1>

                            <p>
                                Your personalized
                                AI clothing designs.
                            </p>
                        </div>

                        <button
                            className="saved-designs-new-button"
                            onClick={() =>
                                navigate(
                                    '/ai-design'
                                )
                            }
                        >
                            + New Design
                        </button>
                    </div>
                </header>

                <section className="saved-designs-grid">
                    {designs.map(
                        renderDesignCard
                    )}
                </section>
            </main>
        </div>
    );
}

export default SavedDesignsPage;