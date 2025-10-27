import * as React from 'react'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'
import { DayPicker } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>['variant']
}) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        'bg-background group/calendar p-3',
        className,
      )}
      classNames={{
        months: 'flex gap-4 flex-col md:flex-row relative',
        month: 'flex flex-col w-full gap-4',
        nav: 'flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between',
        button_previous: cn(
          'size-9 aria-disabled:opacity-50 p-0 select-none'
        ),
        button_next: cn(
          'size-9 aria-disabled:opacity-50 p-0 select-none'
        ),
        month_caption: 'flex items-center justify-center h-9 w-full px-9',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md flex-1 font-normal text-sm select-none',
        week: 'flex w-full mt-2',
        day: 'relative w-full h-full p-0 text-center aspect-square select-none',
        day_button: 'relative w-full h-full p-0 text-center aspect-square select-none',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...props }: { orientation: 'left' | 'right' | 'up' | 'down', className?: string }) => {
          if (orientation === 'left') {
            return <ChevronLeftIcon className={cn('size-4')} {...props} />
          }
          if (orientation === 'right') {
            return <ChevronRightIcon className={cn('size-4')} {...props} />
          }
          return <ChevronDownIcon className={cn('size-4')} {...props} />
        },
        DayButton: ({ day, modifiers, ...props }: { day: { date: Date }, modifiers: any, className?: string }) => (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'size-9 p-0 font-normal',
              modifiers.today && 'bg-accent text-accent-foreground',
              modifiers.selected && 'bg-primary text-primary-foreground'
            )}
            {...props}
          >
            {day.date.getDate()}
          </Button>
        ),
      }}
      {...props}
    />
  )
}

export { Calendar }
