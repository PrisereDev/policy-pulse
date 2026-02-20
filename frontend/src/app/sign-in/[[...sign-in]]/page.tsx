import { SignIn } from "@clerk/nextjs";
import { Logo } from "@/components/brand/logo";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="mb-8">
          <Logo width={200} height={66} />
        </div>
        <h1 
          className="text-center text-3xl font-bold text-prisere-dark-gray mb-2"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Welcome back
        </h1>
        <p 
          className="text-center text-gray-600 mb-8"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Sign in to compare your insurance policies
        </p>
        <div className="w-full">
          <SignIn
            forceRedirectUrl="/dashboard"
            appearance={{
              elements: {
                formButtonPrimary: 
                  'bg-prisere-maroon hover:bg-prisere-maroon/90 text-white',
                footerActionLink: 
                  'text-prisere-teal hover:text-prisere-teal/80',
                formFieldInput: 
                  'border-gray-300 focus:border-prisere-maroon focus:ring-prisere-maroon',
                headerTitle:
                  'hidden',
                headerSubtitle:
                  'hidden',
                card:
                  'shadow-md',
                rootBox:
                  'mx-auto'
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}