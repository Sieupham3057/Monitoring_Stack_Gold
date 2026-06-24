import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAppDispatch } from '@/app/hooks'
import { useGetCategoriesQuery } from '@/features/categories/categoryApi'
import { applyApiFormErrors } from '@/shared/hooks/useApiFormError'
import { Modal } from '@/shared/ui/Modal'
import { showToast } from '@/shared/ui/uiSlice'
import { useCreateProductMutation, useUpdateProductMutation } from './productApi'
import type { Product } from './types'

const schema = z.object({
  name: z.string().trim().min(2, 'Tên cần ít nhất 2 ký tự').max(200, 'Tên tối đa 200 ký tự'),
  description: z.string().trim().max(2000, 'Mô tả tối đa 2.000 ký tự'),
  price: z.number().min(0.01, 'Giá phải lớn hơn 0'),
  stock: z.number().int('Tồn kho phải là số nguyên').min(0, 'Tồn kho không được âm'),
  categoryId: z.number().int().min(1, 'Vui lòng chọn danh mục'),
})
type FormValues = z.infer<typeof schema>

export function ProductFormModal({ visible, product, onClose }: { visible: boolean; product: Product | null; onClose: () => void }) {
  const dispatch = useAppDispatch()
  const categories = useGetCategoriesQuery({ PageNumber: 1, PageSize: 100, SortBy: 'name' })
  const [createProduct, createState] = useCreateProductMutation()
  const [updateProduct, updateState] = useUpdateProductMutation()
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: { name: '', description: '', price: 0, stock: 0, categoryId: 0 },
  })

  useEffect(() => { reset({ name: product?.name ?? '', description: product?.description ?? '', price: product?.price ?? 0, stock: product?.stock ?? 0, categoryId: product?.categoryId ?? 0 }) }, [product, reset, visible])

  const submit = async (values: FormValues) => {
    const body = { ...values, description: values.description || null }
    try {
      if (product) await updateProduct({ id: product.id, body }).unwrap()
      else await createProduct(body).unwrap()
      dispatch(showToast({ color: 'success', title: product ? 'Cập nhật sản phẩm thành công' : 'Tạo sản phẩm thành công' }))
      onClose()
    } catch (error) {
      const normalized = applyApiFormErrors(error, setError)
      setError('root', { message: normalized.message })
    }
  }
  const busy = createState.isLoading || updateState.isLoading

  return (
    <Modal visible={visible} size="large" title={product ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm'} onClose={onClose} footer={
      <><button className="button button-secondary" disabled={busy} type="button" onClick={onClose}>Hủy</button><button className="button button-primary" disabled={busy || categories.isLoading} form="product-form" type="submit">{busy ? 'Đang lưu…' : 'Lưu'}</button></>
    }>
      <form id="product-form" noValidate onSubmit={(event) => void handleSubmit(submit)(event)}>
        {errors.root?.message && <div className="alert alert-danger">{errors.root.message}</div>}
        <div className="form-grid">
          <div className="form-group span-2"><label htmlFor="product-name">Tên sản phẩm</label><input id="product-name" className={errors.name ? 'form-control invalid' : 'form-control'} {...register('name')} />{errors.name && <span className="field-error">{errors.name.message}</span>}</div>
          <div className="form-group"><label htmlFor="product-category">Danh mục</label><select id="product-category" className={errors.categoryId ? 'form-select invalid' : 'form-select'} {...register('categoryId', { valueAsNumber: true })}><option value={0}>Chọn danh mục</option>{categories.data?.items.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{errors.categoryId && <span className="field-error">{errors.categoryId.message}</span>}</div>
          <div className="form-group"><label htmlFor="product-price">Giá bán</label><input id="product-price" className={errors.price ? 'form-control invalid' : 'form-control'} type="number" min="0.01" step="0.01" {...register('price', { valueAsNumber: true })} />{errors.price && <span className="field-error">{errors.price.message}</span>}</div>
          <div className="form-group"><label htmlFor="product-stock">Tồn kho</label><input id="product-stock" className={errors.stock ? 'form-control invalid' : 'form-control'} type="number" min="0" step="1" {...register('stock', { valueAsNumber: true })} />{errors.stock && <span className="field-error">{errors.stock.message}</span>}</div>
          <div className="form-group form-full"><label htmlFor="product-description">Mô tả</label><textarea id="product-description" className={errors.description ? 'form-control invalid' : 'form-control'} rows={4} {...register('description')} />{errors.description && <span className="field-error">{errors.description.message}</span>}</div>
        </div>
      </form>
    </Modal>
  )
}
