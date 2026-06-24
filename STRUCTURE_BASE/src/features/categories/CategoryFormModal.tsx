import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAppDispatch } from '@/app/hooks'
import { applyApiFormErrors } from '@/shared/hooks/useApiFormError'
import { Modal } from '@/shared/ui/Modal'
import { showToast } from '@/shared/ui/uiSlice'
import { useCreateCategoryMutation, useUpdateCategoryMutation } from './categoryApi'
import type { Category } from './types'

const schema = z.object({
  name: z.string().trim().min(2, 'Tên cần ít nhất 2 ký tự').max(100, 'Tên tối đa 100 ký tự'),
  description: z.string().trim().max(1000, 'Mô tả tối đa 1.000 ký tự'),
})
type FormValues = z.infer<typeof schema>

export function CategoryFormModal({ visible, category, onClose }: { visible: boolean; category: Category | null; onClose: () => void }) {
  const dispatch = useAppDispatch()
  const [createCategory, createState] = useCreateCategoryMutation()
  const [updateCategory, updateState] = useUpdateCategoryMutation()
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: { name: '', description: '' },
  })

  useEffect(() => { reset({ name: category?.name ?? '', description: category?.description ?? '' }) }, [category, reset, visible])

  const submit = async (values: FormValues) => {
    const body = { ...values, description: values.description || null }
    try {
      if (category) await updateCategory({ id: category.id, body }).unwrap()
      else await createCategory(body).unwrap()
      dispatch(showToast({ color: 'success', title: category ? 'Cập nhật thành công' : 'Tạo danh mục thành công' }))
      onClose()
    } catch (error) {
      const normalized = applyApiFormErrors(error, setError)
      setError('root', { message: normalized.message })
    }
  }
  const busy = createState.isLoading || updateState.isLoading

  return (
    <Modal visible={visible} title={category ? 'Cập nhật danh mục' : 'Thêm danh mục'} onClose={onClose} footer={
      <><button className="button button-secondary" disabled={busy} type="button" onClick={onClose}>Hủy</button><button className="button button-primary" disabled={busy} form="category-form" type="submit">{busy ? 'Đang lưu…' : 'Lưu'}</button></>
    }>
      <form id="category-form" noValidate onSubmit={(event) => void handleSubmit(submit)(event)}>
        {errors.root?.message && <div className="alert alert-danger">{errors.root.message}</div>}
        <div className="form-group"><label htmlFor="category-name">Tên danh mục</label><input id="category-name" className={errors.name ? 'form-control invalid' : 'form-control'} {...register('name')} />{errors.name && <span className="field-error">{errors.name.message}</span>}</div>
        <div className="form-group"><label htmlFor="category-description">Mô tả</label><textarea id="category-description" className={errors.description ? 'form-control invalid' : 'form-control'} rows={4} {...register('description')} />{errors.description && <span className="field-error">{errors.description.message}</span>}</div>
      </form>
    </Modal>
  )
}
