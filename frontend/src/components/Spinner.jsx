import React from 'react';

/**
 * Spinner – Pure CSS border spinner. Buttery smooth single animation.
 * Just a rounded border with one transparent side, rotating at constant speed.
 * No competing animations = no jank.
 *
 * Sizes: xs (12), sm (16), md (20), lg (28), xl (40)
 */
const sizeMap = {
    xs: { wh: 12, border: 1.5 },
    sm: { wh: 16, border: 2 },
    md: { wh: 20, border: 2 },
    lg: { wh: 28, border: 2.5 },
    xl: { wh: 40, border: 3 },
};

const Spinner = ({ size = 'sm', className = '' }) => {
    const s = sizeMap[size] || sizeMap.sm;

    return (
        <span
            className={`inline-block shrink-0 ${className}`}
            role="status"
            aria-label="Loading"
            style={{
                width: s.wh,
                height: s.wh,
                border: `${s.border}px solid currentColor`,
                borderTopColor: 'transparent',
                borderRadius: '50%',
                opacity: 0.9,
                animation: 'sp-rotate 0.6s linear infinite',
            }}
        />
    );
};

// Inject keyframes once
const SpinnerWithStyles = (props) => (
    <>
        <Spinner {...props} />
        <style>{`@keyframes sp-rotate{to{transform:rotate(360deg)}}`}</style>
    </>
);

export default SpinnerWithStyles;
