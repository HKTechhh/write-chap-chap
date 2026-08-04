import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Home } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/Button'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4 text-center">
      <Link to="/" className="mb-10">
        <Logo />
      </Link>
      <p className="text-7xl font-extrabold tracking-tight gradient-text">404</p>
      <h1 className="mt-4 text-2xl font-bold text-ink-900">This page doesn't exist</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        The link may be broken, or the page may have moved since you last saw it.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(-1)}>
          Go back
        </Button>
        <Link to="/">
          <Button icon={<Home className="h-4 w-4" />}>Home</Button>
        </Link>
      </div>
    </div>
  )
}
