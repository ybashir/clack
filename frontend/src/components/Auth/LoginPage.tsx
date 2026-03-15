import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '@/stores/useAuthStore';

export function LoginPage() {
  const [error, setError] = useState('');
  const { googleLogin } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/favicon-192.png" alt="Clack" className="h-12 w-12 rounded-lg" />
          <span className="text-3xl font-bold text-slack-primary">clack</span>
        </div>
        <h1 className="text-4xl font-bold text-slack-primary">Sign in to Clack</h1>
        <p className="mt-2 text-gray-600">
          Sign in with your Google account to get started.
        </p>
      </div>

      {/* Google Sign-In */}
      <div className="w-full max-w-[400px] px-4 flex flex-col items-center">
        {error && (
          <div className="mb-4 w-full rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <GoogleLogin
          onSuccess={async (response) => {
            setError('');
            if (!response.credential) {
              setError('No credential received from Google');
              return;
            }
            try {
              await googleLogin(response.credential);
              navigate('/');
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Sign in failed';
              setError(message);
            }
          }}
          onError={() => {
            setError('Google sign in failed. Please try again.');
          }}
          size="large"
          width={350}
          text="signin_with"
          shape="rectangular"
        />
      </div>
    </div>
  );
}
