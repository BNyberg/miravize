import { ONBOARDING_STEPS, onboardingIndex } from '@/features/onboarding/progress'
import { cn } from '@/lib/utils'

export function OnboardingProgress({ step }: { step: (typeof ONBOARDING_STEPS)[number]['id'] }) {
  const current = onboardingIndex(step)
  return (
    <div>
      <ol className="grid grid-cols-6 gap-1.5" aria-label={`Step ${current + 1} of ${ONBOARDING_STEPS.length}`}>
        {ONBOARDING_STEPS.map((item, index) => (
          <li key={item.id}>
            <span className="sr-only">
              {item.label}
              {index === current ? ', current' : index < current ? ', done' : ''}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'block h-1 rounded-full motion-reduce:transition-none',
                index <= current ? 'bg-[#1f7a4d]' : 'bg-[#e7e4de]',
              )}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}
