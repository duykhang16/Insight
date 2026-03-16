import React, { useState, useEffect, useRef } from 'react';

const MIN_DISPLAY_MS = 1500;  // minimum splash duration — always visible
const MAX_DISPLAY_MS = 4000;  // timeout — enter dashboard even if prefetch pending

const SplashScreen = ({ prefetchPromise, email, onComplete }) => {
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('Authenticating...');
    const [fadeOut, setFadeOut] = useState(false);
    const startTime = useRef(Date.now());
    const hasCompleted = useRef(false);
    const prefetchDone = useRef(false);
    const prefetchData = useRef(null);
    const timeoutRef = useRef(null);

    const triggerComplete = (data) => {
        if (hasCompleted.current) return;
        hasCompleted.current = true;
        
        setProgress(100);
        setStatusText('Ready');
        setFadeOut(true);

        // Allow fade-out animation to play
        setTimeout(() => {
            onComplete(data);
        }, 500);
    };

    useEffect(() => {
        // Staged progress animation — runs regardless of prefetch speed
        const stage1 = setTimeout(() => {
            if (!hasCompleted.current) {
                setProgress(25);
                setStatusText('Loading your zones...');
            }
        }, 200);

        const stage2 = setTimeout(() => {
            if (!hasCompleted.current) {
                setProgress(50);
                setStatusText('Preparing your workspace...');
            }
        }, 600);

        const stage3 = setTimeout(() => {
            if (!hasCompleted.current) {
                setProgress(75);
                setStatusText('Almost ready...');
            }
        }, 1000);

        // After minimum time, check if prefetch is done and complete
        const minTimer = setTimeout(() => {
            if (prefetchDone.current) {
                triggerComplete(prefetchData.current);
            } else {
                // Prefetch still running — wait for it (up to MAX)
                setProgress(90);
                setStatusText('Finishing up...');
            }
        }, MIN_DISPLAY_MS);

        // Timeout safety net
        timeoutRef.current = setTimeout(() => {
            triggerComplete(prefetchData.current);
        }, MAX_DISPLAY_MS);

        // Track prefetch completion
        if (prefetchPromise) {
            prefetchPromise.then((data) => {
                prefetchData.current = data;
                prefetchDone.current = true;
                // If min time already passed, complete now
                if (Date.now() - startTime.current >= MIN_DISPLAY_MS && !hasCompleted.current) {
                    triggerComplete(data);
                }
            }).catch(() => {
                prefetchDone.current = true;
                if (Date.now() - startTime.current >= MIN_DISPLAY_MS && !hasCompleted.current) {
                    triggerComplete(null);
                }
            });
        } else {
            prefetchDone.current = true;
        }

        return () => {
            clearTimeout(stage1);
            clearTimeout(stage2);
            clearTimeout(stage3);
            clearTimeout(minTimer);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className={`splash-screen ${fadeOut ? 'splash-fade-out' : ''}`}>
            {/* Background orbs */}
            <div className="splash-orb splash-orb-1" />
            <div className="splash-orb splash-orb-2" />
            <div className="splash-orb splash-orb-3" />

            {/* Center content */}
            <div className="splash-content">
                {/* Logo */}
                <div className="splash-logo-container">
                    <div className="splash-logo-glow" />
                    <div className="splash-logo-icon">
                        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 4L34 12V28L20 36L6 28V12L20 4Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                            <path d="M20 10L28 15V25L20 30L12 25V15L20 10Z" stroke="currentColor" strokeWidth="1" opacity="0.5" fill="none" />
                            <circle cx="20" cy="20" r="4" fill="currentColor" opacity="0.6" />
                        </svg>
                    </div>
                </div>

                {/* Title */}
                <h1 className="splash-title">INSIGHT</h1>

                {/* Welcome */}
                <p className="splash-welcome">
                    Welcome, {email || 'User'}
                </p>

                {/* Progress bar */}
                <div className="splash-progress-track">
                    <div
                        className="splash-progress-fill"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Status */}
                <p className="splash-status">{statusText}</p>
            </div>

            <style>{`
                .splash-screen {
                    position: fixed;
                    inset: 0;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--color-bg-base, #020617);
                    transition: opacity 0.4s ease, transform 0.4s ease;
                    overflow: hidden;
                }

                .splash-fade-out {
                    opacity: 0;
                    transform: scale(1.02);
                }

                /* Background orbs — muted teal */
                .splash-orb {
                    position: absolute;
                    border-radius: 50%;
                    filter: blur(120px);
                    pointer-events: none;
                }
                .splash-orb-1 {
                    top: -15%;
                    left: -10%;
                    width: 40%;
                    height: 40%;
                    background: rgba(13, 148, 136, 0.06);
                }
                .splash-orb-2 {
                    bottom: -15%;
                    right: -10%;
                    width: 35%;
                    height: 35%;
                    background: rgba(6, 182, 212, 0.05);
                }
                .splash-orb-3 {
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 30%;
                    height: 30%;
                    background: rgba(20, 184, 166, 0.04);
                }

                /* Center content */
                .splash-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0;
                    animation: splash-slide-up 0.6s ease-out;
                }

                @keyframes splash-slide-up {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                /* Logo */
                .splash-logo-container {
                    position: relative;
                    width: 72px;
                    height: 72px;
                    margin-bottom: 24px;
                }

                .splash-logo-glow {
                    position: absolute;
                    inset: -12px;
                    border-radius: 50%;
                    background: radial-gradient(circle, rgba(13, 148, 136, 0.15) 0%, transparent 70%);
                    animation: splash-pulse 2.5s ease-in-out infinite;
                }

                @keyframes splash-pulse {
                    0%, 100% { opacity: 0.5; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.1); }
                }

                .splash-logo-icon {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #0D9488;
                }

                .splash-logo-icon svg {
                    width: 48px;
                    height: 48px;
                }

                /* Title */
                .splash-title {
                    font-size: 1.5rem;
                    font-weight: 900;
                    color: var(--color-text-primary, #E2E8F0);
                    letter-spacing: 0.3em;
                    margin: 0 0 12px 0;
                    font-style: italic;
                }

                /* Welcome */
                .splash-welcome {
                    font-size: 0.8rem;
                    color: rgba(94, 234, 212, 0.5);
                    margin: 0 0 32px 0;
                    font-weight: 500;
                }

                /* Progress bar */
                .splash-progress-track {
                    width: 220px;
                    height: 3px;
                    background: var(--color-bg-surface-alt, #1E293B);
                    border-radius: 4px;
                    overflow: hidden;
                    margin-bottom: 14px;
                }

                .splash-progress-fill {
                    height: 100%;
                    border-radius: 4px;
                    background: linear-gradient(90deg, #0D9488, #14B8A6, #06B6D4);
                    transition: width 0.4s ease;
                }

                /* Status */
                .splash-status {
                    font-size: 0.7rem;
                    color: var(--color-text-muted, #64748B);
                    margin: 0;
                    letter-spacing: 0.05em;
                }
            `}</style>
        </div>
    );
};

export default SplashScreen;
