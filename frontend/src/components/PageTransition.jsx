import { useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';

const getConfigurationShellPath = (pathname) => {
    const match = pathname.match(/^\/site\/([^/]+)\/configuration\/[^/]+$/);
    return match ? `/site/${match[1]}/configuration` : null;
};

/**
 * PageTransition — wraps content with a fade+slide-up animation
 * whenever the route changes.
 */
const PageTransition = ({ children }) => {
    const location = useLocation();
    const [displayChildren, setDisplayChildren] = useState(children);
    const [transitionState, setTransitionState] = useState('enter'); // 'enter' | 'exit'
    const prevPathRef = useRef(location.pathname);

    useEffect(() => {
        if (location.pathname !== prevPathRef.current) {
            const previousConfigurationShell = getConfigurationShellPath(prevPathRef.current);
            const nextConfigurationShell = getConfigurationShellPath(location.pathname);

            if (previousConfigurationShell && previousConfigurationShell === nextConfigurationShell) {
                setDisplayChildren(children);
                setTransitionState('enter');
                prevPathRef.current = location.pathname;
                return undefined;
            }

            // Route changed — start exit animation
            setTransitionState('exit');

            const exitTimer = setTimeout(() => {
                // Swap content and trigger enter animation
                setDisplayChildren(children);
                setTransitionState('enter');
                prevPathRef.current = location.pathname;
            }, 150); // exit duration

            return () => clearTimeout(exitTimer);
        } else {
            // Same route, just update children
            setDisplayChildren(children);
        }
    }, [location.pathname, children]);

    const animStyles = {
        enter: {
            animation: 'pageEnter 0.25s ease-out forwards',
        },
        exit: {
            animation: 'pageExit 0.15s ease-in forwards',
        },
    };

    return (
        <>
            <style>{`
                @keyframes pageEnter {
                    from {
                        opacity: 0;
                        transform: translateY(8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes pageExit {
                    from {
                        opacity: 1;
                        transform: translateY(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateY(-4px);
                    }
                }
            `}</style>
            <div style={animStyles[transitionState]}>
                {displayChildren}
            </div>
        </>
    );
};

export default PageTransition;
