import type * as React from 'react'
import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, ShieldCheck, Upload, User as UserIcon } from 'lucide-react'
import { auth as authApi, clientProfile, writers as writersApi } from '@/api/endpoints'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { SUBJECTS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Field'
import { Alert, Avatar, Tabs } from '@/components/ui/Misc'
import { PageIntro } from '@/pages/client/ClientDashboard'

export default function Account() {
  const { user, isWriter, refresh } = useAuth()
  const [tab, setTab] = useState('profile')

  const tabs = [
    { value: 'profile', label: 'Profile' },
    ...(isWriter ? [{ value: 'writer', label: 'Writer details' }] : []),
    ...(isWriter ? [{ value: 'kyc', label: 'Identity (KYC)' }] : []),
    { value: 'security', label: 'Security' },
  ]

  if (!user) return null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageIntro title="Account" subtitle="Your details, profile and security settings." />

      <div className="card flex items-center gap-4 p-6">
        <Avatar name={user.display_name} src={user.avatar} size="lg" />
        <div className="min-w-0">
          <p className="text-lg font-semibold text-ink-900">{user.display_name}</p>
          <p className="text-sm text-ink-500">{user.email}</p>
          <span className="mt-2 inline-flex rounded-full bg-ink-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-600">
            {user.role}
          </span>
        </div>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'profile' && <ProfileTab onSaved={refresh} />}
      {tab === 'writer' && <WriterTab />}
      {tab === 'kyc' && <KycTab onSaved={refresh} />}
      {tab === 'security' && <SecurityTab />}
    </div>
  )
}

function ProfileTab({ onSaved }: { onSaved: () => Promise<void> }) {
  const { user, isClient } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    country: user?.country ?? 'Kenya',
  })
  const [company, setCompany] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isClient) return
    clientProfile
      .get()
      .then((data: any) => setCompany(data?.company_name ?? ''))
      .catch(() => {})
  }, [isClient])

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  const save = async () => {
    setBusy(true)
    try {
      await authApi.updateMe(form)
      if (isClient) await clientProfile.update({ company_name: company })
      await onSaved()
      toast.success('Profile updated')
    } catch (error) {
      toast.error('Could not save', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Personal details" icon={<UserIcon className="h-4 w-4" />} />
      <div className="space-y-5 p-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input name="first_name" label="First name" value={form.first_name} onChange={set('first_name')} />
          <Input name="last_name" label="Last name" value={form.last_name} onChange={set('last_name')} />
        </div>
        <Input name="email" type="email" label="Email" value={form.email} onChange={set('email')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            name="phone"
            label="Phone (M-Pesa)"
            placeholder="0712 345 678"
            value={form.phone}
            onChange={set('phone')}
          />
          <Input name="country" label="Country" value={form.country} onChange={set('country')} />
        </div>
        {isClient && (
          <Input
            name="company_name"
            label="Company (optional)"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        )}
        <Button loading={busy} onClick={save}>
          Save changes
        </Button>
      </div>
    </Card>
  )
}

function WriterTab() {
  const toast = useToast()
  const [form, setForm] = useState({
    headline: '',
    bio: '',
    years_experience: 0,
    subjects: [] as string[],
    skills: '' as string,
    languages: '' as string,
  })
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    writersApi
      .myProfile()
      .then((profile) =>
        setForm({
          headline: profile.headline ?? '',
          bio: profile.bio ?? '',
          years_experience: profile.years_experience ?? 0,
          subjects: profile.subjects ?? [],
          skills: (profile.skills ?? []).join(', '),
          languages: (profile.languages ?? []).join(', '),
        }),
      )
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const toggleSubject = (value: string) => {
    setForm((current) => ({
      ...current,
      subjects: current.subjects.includes(value)
        ? current.subjects.filter((item) => item !== value)
        : [...current.subjects, value],
    }))
  }

  const save = async () => {
    setBusy(true)
    try {
      await writersApi.updateMyProfile({
        headline: form.headline,
        bio: form.bio,
        years_experience: Number(form.years_experience) || 0,
        subjects: form.subjects,
        skills: form.skills.split(',').map((item) => item.trim()).filter(Boolean),
        languages: form.languages.split(',').map((item) => item.trim()).filter(Boolean),
      })
      toast.success('Writer profile updated', 'Clients see this when reviewing your bids.')
    } catch (error) {
      toast.error('Could not save', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Your public writer profile"
        description="This is what clients read before accepting your bid."
      />
      <div className="space-y-5 p-5">
        <Input
          name="headline"
          label="Headline"
          placeholder="Nursing & healthcare specialist, 6 years"
          hint="One line. What are you best at?"
          value={form.headline}
          onChange={(event) => setForm({ ...form, headline: event.target.value })}
        />

        <Textarea
          name="bio"
          label="About you"
          rows={6}
          placeholder="Your background, how you work, what clients can expect."
          value={form.bio}
          onChange={(event) => setForm({ ...form, bio: event.target.value })}
        />

        <div>
          <p className="label">Subjects you write in</p>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((subject) => (
              <button
                key={subject.value}
                type="button"
                onClick={() => toggleSubject(subject.value)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  form.subjects.includes(subject.value)
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-ink-300 bg-white text-ink-600 hover:border-brand-300',
                )}
              >
                {subject.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            name="skills"
            label="Skills"
            hint="Comma separated"
            placeholder="Research, APA 7, Editing"
            value={form.skills}
            onChange={(event) => setForm({ ...form, skills: event.target.value })}
          />
          <Input
            name="languages"
            label="Languages"
            hint="Comma separated"
            placeholder="English, Swahili"
            value={form.languages}
            onChange={(event) => setForm({ ...form, languages: event.target.value })}
          />
        </div>

        <Input
          name="years_experience"
          type="number"
          min={0}
          label="Years of experience"
          value={form.years_experience}
          onChange={(event) =>
            setForm({ ...form, years_experience: Number(event.target.value) })
          }
        />

        <Button loading={busy} disabled={!loaded} onClick={save}>
          Save profile
        </Button>
      </div>
    </Card>
  )
}

function KycTab({ onSaved }: { onSaved: () => Promise<void> }) {
  const { user } = useAuth()
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [busy, setBusy] = useState(false)

  const status = user?.kyc_status ?? 'not_submitted'

  const submit = async () => {
    if (!file) return toast.error('Attach a photo of your ID.')
    setBusy(true)
    try {
      const form = new FormData()
      form.append('kyc_document', file)
      form.append('phone', phone)
      await writersApi.submitKyc(form)
      await onSaved()
      toast.success('Submitted for review', 'Usually approved within a day.')
      setFile(null)
    } catch (error) {
      toast.error('Submission failed', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Identity verification" icon={<ShieldCheck className="h-4 w-4" />} />
      <div className="space-y-5 p-5">
        {status === 'approved' ? (
          <Alert tone="success" icon={<CheckCircle2 className="h-4 w-4" />} title="Verified">
            Your identity is confirmed. Withdrawals are enabled.
          </Alert>
        ) : status === 'pending' ? (
          <Alert tone="info" title="Under review">
            We're checking your documents. You'll be notified as soon as it's approved.
          </Alert>
        ) : status === 'rejected' ? (
          <Alert tone="danger" title="Rejected">
            Your previous submission couldn't be verified. Upload a clearer photo of a valid
            government ID.
          </Alert>
        ) : (
          <Alert tone="warning" title="Required before your first payout">
            Upload a government ID and confirm your phone number. This protects both you and the
            clients you work with.
          </Alert>
        )}

        {status !== 'approved' && (
          <>
            <Input
              name="phone"
              label="Phone number"
              placeholder="0712 345 678"
              hint="Must match the M-Pesa number you'll withdraw to."
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />

            <div>
              <p className="label">Government ID</p>
              <label
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
                  file ? 'border-brand-400 bg-brand-50' : 'border-ink-300 bg-ink-50 hover:border-brand-400',
                )}
              >
                <input
                  type="file"
                  className="sr-only"
                  accept="image/*,.pdf"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <Upload className="h-8 w-8 text-ink-400" />
                <p className="mt-2.5 text-sm font-semibold text-ink-800">
                  {file ? file.name : 'Upload your national ID or passport'}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">JPG, PNG or PDF</p>
              </label>
            </div>

            <Button loading={busy} onClick={submit}>
              Submit for verification
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

function SecurityTab() {
  const toast = useToast()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (newPassword !== confirm) return toast.error('New passwords do not match.')
    setBusy(true)
    try {
      await authApi.changePassword(oldPassword, newPassword)
      toast.success('Password changed')
      setOldPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (error) {
      toast.error('Could not change password', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Change password" icon={<KeyRound className="h-4 w-4" />} />
      <div className="space-y-5 p-5">
        <Input
          name="old_password"
          type="password"
          label="Current password"
          autoComplete="current-password"
          value={oldPassword}
          onChange={(event) => setOldPassword(event.target.value)}
        />
        <Input
          name="new_password"
          type="password"
          label="New password"
          hint="At least 8 characters, not entirely numeric."
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <Input
          name="confirm"
          type="password"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <Button loading={busy} onClick={submit}>
          Update password
        </Button>
      </div>
    </Card>
  )
}
