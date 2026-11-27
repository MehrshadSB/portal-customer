'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useI18n } from '@portal/i18n/react';
import {
  TICKET_PRIORITIES,
  type OrderDto,
  type TicketCategoryDto,
  type TicketDetailDto,
} from '@portal/types';
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Select,
  SkeletonTable,
  Textarea,
} from '@portal/ui';
import { createTicketSchema, type CreateTicketInput } from '@portal/validators';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { portalApi } from '@/lib/api';

function NewTicketContent() {
  const router = useRouter();
  const params = useSearchParams();
  const presetOrderId = params.get('orderId') ?? '';
  const { t, translateError, translateStatus } = useI18n();
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['portal', 'ticket-categories'],
    queryFn: async () => (await portalApi.get<TicketCategoryDto[]>('/tickets/categories')).data,
  });

  const ordersQuery = useQuery({
    queryKey: ['portal', 'orders', 'lookup'],
    queryFn: async () => (await portalApi.get<OrderDto[]>('/orders?limit=100')).data,
  });

  const form = useForm({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      orderId: presetOrderId || undefined,
      priority: 'medium',
      categoryId: '',
      subject: '',
      description: '',
    },
  });

  const firstCatId = categoriesQuery.data?.[0]?.id;
  React.useEffect(() => {
    if (firstCatId && !form.getValues('categoryId')) {
      form.setValue('categoryId', firstCatId);
    }
  }, [firstCatId, form]);

  const mutation = useMutation({
    mutationFn: (body: CreateTicketInput) =>
      portalApi.post<TicketDetailDto>('/tickets', {
        ...body,
        orderId: body.orderId || null,
      }),
    onSuccess: (res) => {
      router.push(`/tickets/${res.data.id}`);
    },
    onError: (err) => {
      const code =
        typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setErrorMsg(
        translateError(code, err instanceof Error ? err.message : 'Unable to create ticket'),
      );
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.tickets.eyebrow}
        title={t.tickets.createTitle}
        description={t.tickets.createDesc}
        actions={
          <Link href="/tickets" className="app-btn app-btn-outline h-8 px-3 text-xs">
            {t.common.back}
          </Link>
        }
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t.tickets.createTitle}</CardTitle>
          <CardDescription>{t.tickets.createDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tk-cat">{t.tickets.category}</Label>
                <Select id="tk-cat" {...form.register('categoryId')}>
                  {categoriesQuery.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tk-prio">{t.common.priority}</Label>
                <Select id="tk-prio" {...form.register('priority')}>
                  {TICKET_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {translateStatus(p)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tk-order">{t.tickets.linkedOrder}</Label>
              <Select id="tk-order" {...form.register('orderId')}>
                <option value="">{t.tickets.noOrderLink}</option>
                {ordersQuery.data?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber}: {o.title} ({o.currentStageName})
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tk-subject">{t.tickets.subject}</Label>
              <Input
                id="tk-subject"
                aria-invalid={Boolean(form.formState.errors.subject)}
                aria-describedby="tk-subject-err"
                {...form.register('subject')}
              />
              <p id="tk-subject-err" className="min-h-[1lh] text-xs text-[var(--color-signal-crimson)]">
                {form.formState.errors.subject?.message ?? ''}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tk-desc">{t.common.description}</Label>
              <Textarea
                id="tk-desc"
                rows={5}
                aria-invalid={Boolean(form.formState.errors.description)}
                aria-describedby="tk-desc-err"
                {...form.register('description')}
              />
              <p id="tk-desc-err" className="min-h-[1lh] text-xs text-[var(--color-signal-crimson)]">
                {form.formState.errors.description?.message ?? ''}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="md" asChild>
                <Link href="/tickets">{t.common.cancel}</Link>
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? t.common.sending : t.tickets.submitTicket}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PortalNewTicketPage() {
  return (
    <React.Suspense fallback={<SkeletonTable rows={4} columns={2} />}>
      <NewTicketContent />
    </React.Suspense>
  );
}
