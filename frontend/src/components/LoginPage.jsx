const GOOGLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

const APPLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
    <path d="M14.94 9.88c-.02-2.15 1.75-3.18 1.83-3.23-1-1.46-2.55-1.66-3.1-1.68-1.32-.13-2.57.78-3.24.78-.67 0-1.7-.76-2.8-.74-1.44.02-2.77.84-3.51 2.13-1.5 2.6-.38 6.45 1.08 8.56.71 1.03 1.56 2.19 2.68 2.15 1.07-.04 1.48-.7 2.78-.7 1.3 0 1.67.7 2.78.67 1.16-.02 1.89-1.05 2.6-2.08.82-1.19 1.16-2.35 1.18-2.41-.03-.01-2.26-.87-2.28-3.45zM12.83 3.32c.59-.72 1-1.72.89-2.72-.86.04-1.9.57-2.52 1.3-.55.64-1.03 1.66-.9 2.64.96.07 1.94-.49 2.53-1.22z"/>
  </svg>
);

export default function LoginPage({ onLoginWithGoogle, error }) {
  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/login-bg.jpg')" }}
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full justify-end px-6 pb-12">
        {/* Tagline */}
        <h1 className="text-white text-[28px] font-bold leading-tight mb-10">
          The World's First Camera That Thinks Before It Sees
        </h1>

        {error && (
          <p className="text-red-400 text-sm text-center mb-4">{error}</p>
        )}

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <button
            className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-full bg-white text-black font-medium text-[15px] active:scale-[0.98] transition-transform"
            onClick={() => {}}
            disabled
            style={{ opacity: 0.4 }}
          >
            {APPLE_ICON}
            Continue with Apple
          </button>

          <button
            className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white font-medium text-[15px] active:scale-[0.98] transition-transform"
            onClick={onLoginWithGoogle}
          >
            {GOOGLE_ICON}
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
