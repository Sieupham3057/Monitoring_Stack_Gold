import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAppDispatch } from '@/app/hooks'
import { useGetProductsQuery } from '@/features/products/productApi'
import { applyApiFormErrors } from '@/shared/hooks/useApiFormError'
import { Icon } from '@/shared/ui/Icon'
import { Modal } from '@/shared/ui/Modal'
import { showToast } from '@/shared/ui/uiSlice'
import { useCreateOrderMutation } from './orderApi'

const schema = z.object({
  items: z.array(z.object({
    productId: z.number().int().min(1, 'Chọn sản phẩm'),
    quantity: z.number().int().min(1, 'Tối thiểu 1').max(1000, 'Tối đa 1.000'),
  })).min(1, 'Đơn hàng cần ít nhất một sản phẩm').max(100, 'Đơn hàng tối đa 100 dòng'),
})
type FormValues = z.infer<typeof schema>

export function CreateOrderModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch()
  const products = useGetProductsQuery({ PageNumber: 1, PageSize: 100, InStock: true, SortBy: 'name' })
  const [createOrder, createState] = useCreateOrderMutation()
  const { control, register, handleSubmit, reset, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: { items: [{ productId: 0, quantity: 1 }] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  useEffect(() => { if (visible) reset({ items: [{ productId: 0, quantity: 1 }] }) }, [reset, visible])

  const submit = async (values: FormValues) => {
    if (new Set(values.items.map((item) => item.productId)).size !== values.items.length) {
      setError('root', { message: 'Một sản phẩm không nên xuất hiện ở nhiều dòng.' })
      return
    }
    try {
      await createOrder(values).unwrap()
      dispatch(showToast({ color: 'success', title: 'Tạo đơn hàng thành công' }))
      onClose()
    } catch (error) {
      const normalized = applyApiFormErrors(error, setError)
      setError('root', { message: normalized.message })
    }
  }

  return (
    <Modal visible={visible} size="large" title="Tạo đơn hàng" onClose={onClose} footer={
      <><button className="button button-secondary" disabled={createState.isLoading} type="button" onClick={onClose}>Hủy</button><button className="button button-primary" disabled={createState.isLoading || products.isLoading} form="order-form" type="submit">{createState.isLoading ? 'Đang tạo…' : 'Tạo đơn'}</button></>
    }>
      <form id="order-form" noValidate onSubmit={(event) => void handleSubmit(submit)(event)}>
        {errors.root?.message && <div className="alert alert-danger">{errors.root.message}</div>}
        <div className="order-lines">
          {fields.map((field, index) => (
            <div className="order-line" key={field.id}>
              <div className="form-group"><label htmlFor={`order-product-${index}`}>Sản phẩm</label><select id={`order-product-${index}`} className={errors.items?.[index]?.productId ? 'form-select invalid' : 'form-select'} {...register(`items.${index}.productId`, { valueAsNumber: true })}><option value={0}>Chọn sản phẩm</option>{products.data?.items.map((product) => <option key={product.id} value={product.id}>{product.name} (còn {product.stock})</option>)}</select>{errors.items?.[index]?.productId && <span className="field-error">{errors.items[index]?.productId?.message}</span>}</div>
              <div className="form-group"><label htmlFor={`order-quantity-${index}`}>Số lượng</label><input id={`order-quantity-${index}`} className={errors.items?.[index]?.quantity ? 'form-control invalid' : 'form-control'} type="number" min="1" max="1000" {...register(`items.${index}.quantity`, { valueAsNumber: true })} />{errors.items?.[index]?.quantity && <span className="field-error">{errors.items[index]?.quantity?.message}</span>}</div>
              <button aria-label="Xóa dòng" className="button button-danger-outline order-remove" disabled={fields.length === 1} type="button" onClick={() => remove(index)}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
        <button className="button button-primary-outline" disabled={fields.length >= 100} type="button" onClick={() => append({ productId: 0, quantity: 1 })}><Icon name="plus" size={18} /> Thêm dòng</button>
      </form>
    </Modal>
  )
}
