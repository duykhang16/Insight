import React from 'react';
import { KeyRound } from 'lucide-react';

/**
 * Shared passkey lock screen for dangerous batch operations.
 * Used by Delete and DeleteSSID modules.
 *
 * @param {Object} props
 * @param {string} props.passkeyInput
 * @param {Function} props.setPasskeyInput
 * @param {boolean} props.passkeyError
 * @param {Function} props.setPasskeyError
 * @param {Function} props.onUnlock - form submit handler
 * @param {Function} props.t - i18n translation
 * @param {string} [props.i18nPrefix] - 'batch_delete' default
 */
const PasskeyLock = ({
    passkeyInput,
    setPasskeyInput,
    passkeyError,
    setPasskeyError,
    onUnlock,
    t,
    i18nPrefix = 'batch_delete',
}) => {
    return (
        <div className="w-full min-h-[700px] flex items-center justify-center bg-slate-50 dark:bg-[#020617] rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl p-8 relative overflow-hidden">
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-rose-600/5 dark:bg-rose-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-600/5 dark:bg-red-600/10 blur-[120px] rounded-full" />
            </div>

            <form onSubmit={onUnlock} className="relative z-10 max-w-sm w-full bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl border border-rose-100 dark:border-rose-900/30 flex flex-col items-center gap-6">
                <div className="w-16 h-16 bg-rose-100 dark:bg-rose-500/20 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400">
                    <KeyRound size={32} />
                </div>
                <div className="text-center">
                    <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-wider">
                        {t(`${i18nPrefix}.restricted_area`) || 'Restricted Area'}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                        {t(`${i18nPrefix}.passkey_prompt`) || 'Enter passkey to access this tool'}
                    </p>
                </div>
                <div className="w-full relative">
                    <input
                        type="password"
                        value={passkeyInput}
                        onChange={e => { setPasskeyInput(e.target.value); setPasskeyError(false); }}
                        placeholder={t(`${i18nPrefix}.enter_passkey`) || 'Enter passkey'}
                        autoFocus
                        className={`w-full text-center bg-slate-50 dark:bg-black/50 border-2 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none transition-colors ${passkeyError ? 'border-rose-500 dark:border-rose-500/80 animate-shake' : 'border-slate-200 dark:border-slate-800 focus:border-rose-500 dark:focus:border-rose-500'}`}
                    />
                    {passkeyError && (
                        <p className="text-[10px] text-rose-500 font-bold text-center mt-2 absolute w-full -bottom-5">
                            {t(`${i18nPrefix}.incorrect_passkey`) || 'Incorrect passkey'}
                        </p>
                    )}
                </div>
                <button type="submit" disabled={!passkeyInput}
                    className="w-full h-12 mt-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-slate-800 dark:disabled:to-slate-800 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-[0_10px_30px_rgba(225,29,72,0.2)] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2">
                    {t(`${i18nPrefix}.unlock_tool`) || 'Unlock'}
                </button>
            </form>
        </div>
    );
};

export default PasskeyLock;
