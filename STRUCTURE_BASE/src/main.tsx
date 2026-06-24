import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { RouterProvider } from 'react-router-dom'
import '@/styles/index.css'
import { router } from '@/app/router'
import { store } from '@/app/store'

const root = document.getElementById('root')
if (!root) throw new Error('Không tìm thấy phần tử #root')

createRoot(root).render(
  <StrictMode>
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>,
)
