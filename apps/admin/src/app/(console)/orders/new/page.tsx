'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useI18n } from '@portal/i18n/react';
import {
  ORDER_PRIORITIES,
  type CustomerDto,
  type DepartmentDto,
  type EmployeeDto,
  type OrderDetailDto,
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
  Textarea,
} from '@portal/ui';
import { createOrderSchema, type CreateOrderInput } from '@portal/validators';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { adminApi } from '@/lib/api';

export default function AdminNewOrderPage() {
  const router = useRouter();
  const { t, translateError, translateStatus } = useI18n();
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ['admin', 'customers', 'lookup'],
    queryFn: () => adminApi.get<CustomerDto[]>('/customers?limit=100&status=active'),
  });

  const deptsQuery = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => adminApi.get<DepartmentDto[]>('/departments'),
  });

  const empsQuery = useQuery({
    queryKey: ['admin', 'employees', 'lookup'],
    queryFn: () => adminApi.get<EmployeeDto[]>('/employees?limit=100&isActive=true'),
  });

  const form = useForm({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      customerId: '',
      title: '',
      priority: 'normal',
      items: [{ partNumber: '', name: '', material: '', specification: '', quantity: 1, unit: 'pcs' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const firstCustId = customersQuery.data?.data?.[0]?.id;
  React.useEffect(() => {
    if (firstCustId && !form.getValues('customerId')) {
      form.setValue('customerId', firstCustId);
    }
  }, [firstCustId, form]);

  const createMutation = useMutation({
    mutationFn: (body: CreateOrderInput) =>
      adminApi.post<OrderDetailDto>('/orders', {
        ...body,
        assignedDepartmentId: body.assignedDepartmentId || null,
        assignedEmployeeId: body.assignedEmployeeId || null,
        expectedCompletionDate: body.expectedCompletionDate || null,
        items: body.items?.filter((i) => i.name.trim().length > 0),
      }),
    onSuccess: (res) => {
      router.push(`/orders/${res.data.id}`);
    },
    onError: (err) => {
      const code =
        typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setErrorMsg(translateError(code, err instanceof Error ? err.message : 'Unable to create order'));
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.orders.eyebrow}
        title={t.orders.createOrderTitle}
        description={t.orders.createOrderDesc}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/orders">{t.common.back}</Link>
          </Button>
        }
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}

      <form
        onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>{t.orders.createOrderTitle}</CardTitle>
            <CardDescription>{t.orders.createOrderDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ord-cust">{t.orders.customer}</Label>
                <Select
                  id="ord-cust"
                  aria-invalid={Boolean(form.formState.errors.customerId)}
                  aria-describedby="ord-cust-err"
                  {...form.register('customerId')}
                >
                  {customersQuery.data?.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {`${c.customerCode} (${c.companyName})`}
                    </option>
                  ))}
                </Select>
                <p id="ord-cust-err" className="min-h-[1lh] text-xs text-[var(--color-error)]">
                  {form.formState.errors.customerId?.message ?? ''}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ord-prio">{t.common.priority}</Label>
                <Select id="ord-prio" {...form.register('priority')}>
                  {ORDER_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {translateStatus(p)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ord-title">{t.tickets.subject}</Label>
                <Input
                  id="ord-title"
                  aria-invalid={Boolean(form.formState.errors.title)}
                  aria-describedby="ord-title-err"
                  {...form.register('title')}
                />
                <p id="ord-title-err" className="min-h-[1lh] text-xs text-[var(--color-error)]">
                  {form.formState.errors.title?.message ?? ''}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ord-po">{t.orders.poNumber}</Label>
                <Input id="ord-po" dir="ltr" {...form.register('poNumber')} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ord-dept">{t.common.department}</Label>
                <Select id="ord-dept" {...form.register('assignedDepartmentId')}>
                  <option value="">{t.common.unassigned}</option>
                  {deptsQuery.data?.data.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ord-emp">{t.tickets.assignee}</Label>
                <Select id="ord-emp" {...form.register('assignedEmployeeId')}>
                  <option value="">{t.common.unassigned}</option>
                  {empsQuery.data?.data.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ord-date">{t.orders.expectedCompletion}</Label>
                <Input
                  id="ord-date"
                  type="date"
                  dir="ltr"
                  {...form.register('expectedCompletionDate')}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ord-desc">{t.common.description}</Label>
                <Textarea id="ord-desc" rows={3} {...form.register('description')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ord-notes">{t.orders.internalNotesHidden}</Label>
                <Textarea id="ord-notes" rows={3} {...form.register('internalNotes')} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t.orders.lineItemsTitle}</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    partNumber: '',
                    name: '',
                    material: '',
                    specification: '',
                    quantity: 1,
                    unit: 'pcs',
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t.orders.addLineItem}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid items-end gap-3 rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3.5 md:grid-cols-6"
              >
                <div className="space-y-1">
                  <Label>{t.orders.partNumber}</Label>
                  <Input dir="ltr" {...form.register(`items.${index}.partNumber`)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>{t.orders.itemName}</Label>
                  <Input {...form.register(`items.${index}.name`)} />
                </div>
                <div className="space-y-1">
                  <Label>{t.orders.material}</Label>
                  <Input {...form.register(`items.${index}.material`)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>{t.orders.quantity}</Label>
                    <Input
                      type="number"
                      step="any"
                      dir="ltr"
                      {...form.register(`items.${index}.quantity`)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t.orders.unit}</Label>
                    <Input dir="ltr" {...form.register(`items.${index}.unit`)} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t.orders.removeLineItem}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4 text-[var(--color-signal-crimson)]" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/orders">{t.common.cancel}</Link>
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? t.common.creating : t.orders.newOrder}
          </Button>
        </div>
      </form>
    </div>
  );
}
