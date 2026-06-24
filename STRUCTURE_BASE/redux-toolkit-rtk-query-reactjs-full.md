# Redux Toolkit + RTK Query trong ReactJS - Bản đầy đủ thực chiến

> Tài liệu này giải thích theo hướng làm dự án thật: `auth`, `product`, `category`, `account`, CRUD, search, pagination, import/export và Skeleton UI.

> Url backend api: http://localhost:5065/swagger/index.html
---

## Mục lục

1. [Tư duy tổng quan](#1-tư-duy-tổng-quan)
2. [Vì sao `store.ts` chỉ có `authReducer`, vậy product/category ở đâu?](#2-vì-sao-storets-chỉ-có-authreducer-vậy-productcategory-ở-đâu)
3. [Cấu trúc project React thực tế](#3-cấu-trúc-project-react-thực-tế)
4. [Luồng chạy tổng thể](#4-luồng-chạy-tổng-thể)
5. [Cài đặt](#5-cài-đặt)
6. [Tạo `main.tsx`](#6-tạo-maintsx)
7. [Tạo `store.ts`](#7-tạo-storets)
8. [Tạo `hooks.ts`](#8-tạo-hooksts)
9. [Tạo `baseApi.ts`](#9-tạo-baseapits)
10. [Auth module: login/logout/token](#10-auth-module-loginlogouttoken)
11. [ProtectedRoute](#11-protectedroute)
12. [Product module CRUD đầy đủ](#12-product-module-crud-đầy-đủ)
13. [Product import/export](#13-product-importexport)
14. [Category module CRUD đầy đủ](#14-category-module-crud-đầy-đủ)
15. [Category import/export](#15-category-importexport)
16. [Account module CRUD](#16-account-module-crud)
17. [Skeleton React là gì?](#17-skeleton-react-là-gì)
18. [Dùng Skeleton với RTK Query](#18-dùng-skeleton-với-rtk-query)
19. [providesTags và invalidatesTags](#19-providestags-và-invalidatestags)
20. [Thunk còn dùng khi nào?](#20-thunk-còn-dùng-khi-nào)
21. [Repository, Manager, Service có cần không?](#21-repository-manager-service-có-cần-không)
22. [Checklist học](#22-checklist-học)
23. [Tổng kết](#23-tổng-kết)

---

# 1. Tư duy tổng quan

Trong React app thực tế có 2 loại state:

```txt
1. Client state
2. Server state
```

## 1.1 Client state

Client state là state chỉ tồn tại ở frontend.

Ví dụ:

```txt
user đang đăng nhập
token
sidebar mở/đóng
theme sáng/tối
modal đang mở không
tab nào đang được chọn
selected row
```

Những state này nên để trong Redux slice.

Ví dụ:

```txt
authSlice
uiSlice
permissionSlice
```

## 1.2 Server state

Server state là dữ liệu lấy từ backend API/database.

Ví dụ:

```txt
danh sách product
danh sách category
danh sách account
chi tiết product
kết quả search
dữ liệu phân trang
file export từ backend
```

Những dữ liệu này nên để RTK Query quản lý.

Ví dụ:

```txt
productApi
categoryApi
accountApi
authApi
```

## 1.3 Câu nhớ nhanh

```txt
Redux slice
→ giữ state nội bộ frontend

RTK Query
→ gọi API, cache, loading, error, refetch

Component
→ gọi hook và render UI
```

---

# 2. Vì sao `store.ts` chỉ có `authReducer`, vậy product/category ở đâu?

Đây là phần dễ nhầm nhất.

Ví dụ ban đầu:

```ts
// src/app/store.ts
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

Anh sẽ hỏi:

```txt
Product thì sao?
Category thì sao?
Account thì sao?
CRUD import/export thì đưa vào đâu?
```

Câu trả lời phụ thuộc cách anh làm.

## 2.1 Nếu dùng createAsyncThunk + createSlice

Nếu dùng thunk, mỗi module thường có reducer riêng:

```ts
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import productReducer from "../features/products/productSlice";
import categoryReducer from "../features/categories/categorySlice";
import accountReducer from "../features/accounts/accountSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    products: productReducer,
    categories: categoryReducer,
    accounts: accountReducer,
  },
});
```

Vì mỗi slice tự giữ:

```txt
products.items
products.loading
products.error

categories.items
categories.loading
categories.error
```

Nhược điểm: CRUD nhiều thì code rất dài.

---

## 2.2 Nếu dùng RTK Query

Nếu dùng RTK Query, product/category/account **không cần reducer riêng** nếu chỉ là dữ liệu API.

Store chuẩn sẽ là:

```ts
// src/app/store.ts
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import { baseApi } from "../shared/api/baseApi";

export const store = configureStore({
  reducer: {
    auth: authReducer,

    [baseApi.reducerPath]: baseApi.reducer,
  },

  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

Lúc này store có dạng:

```txt
state.auth
state.api
```

Trong `state.api`, RTK Query tự quản lý cache của:

```txt
getProducts
getProductById
getCategories
getAccounts
```

Vì vậy không cần:

```txt
productReducer
categoryReducer
accountReducer
```

nếu product/category/account chỉ dùng để gọi CRUD API.

---

## 2.3 Product API được đưa vào store kiểu gì?

Không đưa trực tiếp vào store.

Ta tạo `baseApi`, sau đó dùng:

```ts
baseApi.injectEndpoints(...)
```

Ví dụ:

```ts
export const productApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getProducts: builder.query(...),
    createProduct: builder.mutation(...),
  }),
});
```

Nghĩa là:

```txt
baseApi là API gốc
productApi bơm thêm endpoint product vào baseApi
categoryApi bơm thêm endpoint category vào baseApi
accountApi bơm thêm endpoint account vào baseApi
```

Tất cả vẫn dùng chung:

```txt
state.api
```

---

## 2.4 Khi nào product vẫn cần slice?

Product cần slice riêng khi có client state phức tạp không phải API data.

Ví dụ:

```txt
selectedProductIds
productViewMode: "grid" | "table"
compareProducts
draftProduct chưa submit
advancedFilter đang mở/đóng
```

Nhưng danh sách product lấy từ API thì nên để RTK Query.

---

# 3. Cấu trúc project React thực tế

```txt
src/
  app/
    store.ts
    hooks.ts
    router.tsx
    ProtectedRoute.tsx

  shared/
    api/
      baseApi.ts
      downloadFile.ts
    components/
      SkeletonBox.tsx
      TableSkeleton.tsx
      FormSkeleton.tsx
    types/
      pagedResult.ts
      apiError.ts

  features/
    auth/
      authApi.ts
      authSlice.ts
      types/
        auth.ts
      pages/
        LoginPage.tsx
      components/
        LogoutButton.tsx

    products/
      productApi.ts
      types/
        product.ts
      pages/
        ProductPage.tsx
      components/
        ProductList.tsx
        ProductForm.tsx
        ProductImportExport.tsx
        ProductTableSkeleton.tsx

    categories/
      categoryApi.ts
      types/
        category.ts
      pages/
        CategoryPage.tsx
      components/
        CategoryList.tsx
        CategoryForm.tsx
        CategoryImportExport.tsx

    accounts/
      accountApi.ts
      types/
        account.ts
      pages/
        AccountPage.tsx
      components/
        AccountList.tsx
        AccountForm.tsx
```

---

# 4. Luồng chạy tổng thể

```txt
main.tsx
  ↓
Provider store={store}
  ↓
RouterProvider router={router}
  ↓
ProtectedRoute kiểm tra auth
  ↓
ProductPage
  ↓
ProductList
  ↓
useGetProductsQuery(params)
  ↓
RTK Query gọi GET /products
  ↓
Backend trả data
  ↓
RTK Query cache data vào state.api
  ↓
Component render lại
```

Khi xóa product:

```txt
Click Xóa
  ↓
useDeleteProductMutation()
  ↓
DELETE /products/{id}
  ↓
invalidatesTags ["Product"]
  ↓
RTK Query tự refetch getProducts
  ↓
UI cập nhật
```

---

# 5. Cài đặt

```bash
npm install @reduxjs/toolkit react-redux react-router-dom
```

---

# 6. Tạo `main.tsx`

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "react-router-dom";
import { store } from "./app/store";
import { router } from "./app/router";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>
);
```

---

# 7. Tạo `store.ts`

```ts
// src/app/store.ts
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import { baseApi } from "../shared/api/baseApi";

export const store = configureStore({
  reducer: {
    auth: authReducer,

    [baseApi.reducerPath]: baseApi.reducer,
  },

  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

Giải thích:

```txt
auth: authReducer
→ auth là client state, nên cần slice

[baseApi.reducerPath]: baseApi.reducer
→ toàn bộ cache API nằm ở đây

baseApi.middleware
→ giúp RTK Query chạy cache, refetch, invalidation
```

Quan trọng:

```txt
productApi/categoryApi/accountApi không thêm vào store trực tiếp
vì chúng được inject vào baseApi
```

---

# 8. Tạo `hooks.ts`

```ts
// src/app/hooks.ts
import { useDispatch, useSelector } from "react-redux";
import type { RootState, AppDispatch } from "./store";

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
```

Dùng:

```tsx
const dispatch = useAppDispatch();
const token = useAppSelector((state) => state.auth.token);
```

---

# 9. Tạo `baseApi.ts`

```ts
// src/shared/api/baseApi.ts
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { RootState } from "../../app/store";

export const baseApi = createApi({
  reducerPath: "api",

  baseQuery: fetchBaseQuery({
    baseUrl: "https://localhost:5001/api",

    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token;

      if (token) {
        headers.set("authorization", `Bearer ${token}`);
      }

      return headers;
    },
  }),

  tagTypes: [
    "Product",
    "Category",
    "Account",
    "Auth",
  ],

  endpoints: () => ({}),
});
```

Giải thích:

```txt
baseUrl
→ địa chỉ backend API

prepareHeaders
→ tự động gắn token vào request

tagTypes
→ danh sách tag để RTK Query biết cache nào cần refetch
```

---

# 10. Auth module: login/logout/token

## 10.1 Auth type

```ts
// src/features/auth/types/auth.ts
export type User = {
  id: number;
  username: string;
  fullName: string;
  role: string;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  user: User;
};
```

## 10.2 Auth slice

```ts
// src/features/auth/authSlice.ts
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { User } from "./types/auth";

type AuthState = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
};

const savedToken = localStorage.getItem("token");
const savedUser = localStorage.getItem("user");

const initialState: AuthState = {
  user: savedUser ? JSON.parse(savedUser) : null,
  token: savedToken,
  isAuthenticated: Boolean(savedToken),
};

const authSlice = createSlice({
  name: "auth",

  initialState,

  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ user: User; token: string }>
    ) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;

      localStorage.setItem("token", action.payload.token);
      localStorage.setItem("user", JSON.stringify(action.payload.user));
    },

    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;

      localStorage.removeItem("token");
      localStorage.removeItem("user");
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;
```

## 10.3 Auth API

```ts
// src/features/auth/authApi.ts
import { baseApi } from "../../shared/api/baseApi";
import type { LoginRequest, LoginResponse } from "./types/auth";

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({
        url: "/auth/login",
        method: "POST",
        body,
      }),
    }),
  }),
});

export const { useLoginMutation } = authApi;
```

Chú ý:

```txt
authApi không thêm vào store
vì nó inject vào baseApi
```

## 10.4 LoginPage

```tsx
// src/features/auth/pages/LoginPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch } from "../../../app/hooks";
import { setCredentials } from "../authSlice";
import { useLoginMutation } from "../authApi";

export default function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const [login, { isLoading }] = useLoginMutation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      const result = await login({
        username,
        password,
      }).unwrap();

      dispatch(
        setCredentials({
          user: result.user,
          token: result.token,
        })
      );

      navigate("/products");
    } catch {
      alert("Sai tài khoản hoặc mật khẩu");
    }
  };

  return (
    <section>
      <h1>Đăng nhập</h1>

      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Tên đăng nhập"
      />

      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Mật khẩu"
        type="password"
      />

      <button disabled={isLoading} onClick={handleLogin}>
        {isLoading ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
    </section>
  );
}
```

## 10.5 LogoutButton

```tsx
// src/features/auth/components/LogoutButton.tsx
import { useNavigate } from "react-router-dom";
import { useAppDispatch } from "../../../app/hooks";
import { logout } from "../authSlice";
import { baseApi } from "../../../shared/api/baseApi";

export default function LogoutButton() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const handleLogout = () => {
    dispatch(logout());

    // Xóa cache API khi logout
    dispatch(baseApi.util.resetApiState());

    navigate("/login");
  };

  return <button onClick={handleLogout}>Đăng xuất</button>;
}
```

---

# 11. ProtectedRoute

```tsx
// src/app/ProtectedRoute.tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAppSelector } from "./hooks";

export default function ProtectedRoute() {
  const isAuthenticated = useAppSelector(
    (state) => state.auth.isAuthenticated
  );

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
```

Router:

```tsx
// src/app/router.tsx
import { createBrowserRouter } from "react-router-dom";
import LoginPage from "../features/auth/pages/LoginPage";
import ProductPage from "../features/products/pages/ProductPage";
import CategoryPage from "../features/categories/pages/CategoryPage";
import AccountPage from "../features/accounts/pages/AccountPage";
import ProtectedRoute from "./ProtectedRoute";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },

  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/",
        element: <ProductPage />,
      },
      {
        path: "/products",
        element: <ProductPage />,
      },
      {
        path: "/categories",
        element: <CategoryPage />,
      },
      {
        path: "/accounts",
        element: <AccountPage />,
      },
    ],
  },
]);
```

---

# 12. Product module CRUD đầy đủ

## 12.1 Product types

```ts
// src/features/products/types/product.ts
export type Product = {
  id: number;
  name: string;
  code: string;
  price: number;
  stock: number;
  categoryId: number;
  categoryName: string;
  isActive: boolean;
};

export type ProductQuery = {
  pageNumber: number;
  pageSize: number;
  search?: string;
  categoryId?: number;
  isActive?: boolean;
};

export type PagedResult<T> = {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type CreateProductRequest = {
  name: string;
  code: string;
  price: number;
  stock: number;
  categoryId: number;
  isActive: boolean;
};

export type UpdateProductRequest = {
  id: number;
  name: string;
  code: string;
  price: number;
  stock: number;
  categoryId: number;
  isActive: boolean;
};

export type ImportProductResult = {
  totalRows: number;
  successRows: number;
  failedRows: number;
  errors: {
    rowNumber: number;
    message: string;
  }[];
};
```

## 12.2 Product API

```ts
// src/features/products/productApi.ts
import { baseApi } from "../../shared/api/baseApi";
import type {
  Product,
  ProductQuery,
  PagedResult,
  CreateProductRequest,
  UpdateProductRequest,
  ImportProductResult,
} from "./types/product";

export const productApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getProducts: builder.query<PagedResult<Product>, ProductQuery>({
      query: (params) => ({
        url: "/products",
        method: "GET",
        params,
      }),

      providesTags: ["Product"],
    }),

    getProductById: builder.query<Product, number>({
      query: (id) => ({
        url: `/products/${id}`,
        method: "GET",
      }),

      providesTags: (_result, _error, id) => [
        { type: "Product", id },
      ],
    }),

    createProduct: builder.mutation<Product, CreateProductRequest>({
      query: (body) => ({
        url: "/products",
        method: "POST",
        body,
      }),

      invalidatesTags: ["Product"],
    }),

    updateProduct: builder.mutation<Product, UpdateProductRequest>({
      query: ({ id, ...body }) => ({
        url: `/products/${id}`,
        method: "PUT",
        body,
      }),

      invalidatesTags: (_result, _error, arg) => [
        "Product",
        { type: "Product", id: arg.id },
      ],
    }),

    deleteProduct: builder.mutation<void, number>({
      query: (id) => ({
        url: `/products/${id}`,
        method: "DELETE",
      }),

      invalidatesTags: ["Product"],
    }),

    importProducts: builder.mutation<ImportProductResult, File>({
      query: (file) => {
        const formData = new FormData();
        formData.append("file", file);

        return {
          url: "/products/import",
          method: "POST",
          body: formData,
        };
      },

      invalidatesTags: ["Product"],
    }),

    exportProducts: builder.query<Blob, ProductQuery>({
      query: (params) => ({
        url: "/products/export",
        method: "GET",
        params,
        responseHandler: (response) => response.blob(),
      }),
    }),
  }),
});

export const {
  useGetProductsQuery,
  useGetProductByIdQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useImportProductsMutation,
  useLazyExportProductsQuery,
} = productApi;
```

Giải thích:

```txt
getProducts
→ lấy danh sách product có search/filter/pagination

getProductById
→ lấy chi tiết product

createProduct
→ thêm product

updateProduct
→ sửa product

deleteProduct
→ xóa product

importProducts
→ upload file Excel/CSV

exportProducts
→ tải file Excel/CSV từ backend
```

Chú ý export dùng:

```ts
useLazyExportProductsQuery
```

vì ta chỉ muốn export khi user bấm nút, không muốn tự gọi khi component render.

---

## 12.3 ProductForm dùng cho create/update

```tsx
// src/features/products/components/ProductForm.tsx
import { useState } from "react";
import type {
  Product,
  CreateProductRequest,
  UpdateProductRequest,
} from "../types/product";
import {
  useCreateProductMutation,
  useUpdateProductMutation,
} from "../productApi";

type ProductFormProps = {
  product?: Product | null;
  onSuccess?: () => void;
};

export default function ProductForm({
  product,
  onSuccess,
}: ProductFormProps) {
  const isEdit = Boolean(product);

  const [createProduct, { isLoading: creating }] =
    useCreateProductMutation();

  const [updateProduct, { isLoading: updating }] =
    useUpdateProductMutation();

  const [form, setForm] = useState({
    name: product?.name ?? "",
    code: product?.code ?? "",
    price: product?.price ?? 0,
    stock: product?.stock ?? 0,
    categoryId: product?.categoryId ?? 0,
    isActive: product?.isActive ?? true,
  });

  const loading = creating || updating;

  const handleSubmit = async () => {
    try {
      if (isEdit && product) {
        const request: UpdateProductRequest = {
          id: product.id,
          ...form,
        };

        await updateProduct(request).unwrap();
        alert("Cập nhật sản phẩm thành công");
      } else {
        const request: CreateProductRequest = {
          ...form,
        };

        await createProduct(request).unwrap();
        alert("Tạo sản phẩm thành công");
      }

      onSuccess?.();
    } catch {
      alert("Lưu sản phẩm thất bại");
    }
  };

  return (
    <section>
      <h2>{isEdit ? "Cập nhật sản phẩm" : "Thêm sản phẩm"}</h2>

      <input
        value={form.name}
        onChange={(e) =>
          setForm({
            ...form,
            name: e.target.value,
          })
        }
        placeholder="Tên sản phẩm"
      />

      <input
        value={form.code}
        onChange={(e) =>
          setForm({
            ...form,
            code: e.target.value,
          })
        }
        placeholder="Mã sản phẩm"
      />

      <input
        type="number"
        value={form.price}
        onChange={(e) =>
          setForm({
            ...form,
            price: Number(e.target.value),
          })
        }
        placeholder="Giá"
      />

      <input
        type="number"
        value={form.stock}
        onChange={(e) =>
          setForm({
            ...form,
            stock: Number(e.target.value),
          })
        }
        placeholder="Tồn kho"
      />

      <input
        type="number"
        value={form.categoryId}
        onChange={(e) =>
          setForm({
            ...form,
            categoryId: Number(e.target.value),
          })
        }
        placeholder="Category ID"
      />

      <label>
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) =>
            setForm({
              ...form,
              isActive: e.target.checked,
            })
          }
        />
        Đang hoạt động
      </label>

      <button disabled={loading} onClick={handleSubmit}>
        {loading ? "Đang lưu..." : "Lưu"}
      </button>
    </section>
  );
}
```

---

## 12.4 ProductList dùng get/update/delete

```tsx
// src/features/products/components/ProductList.tsx
import { useState } from "react";
import {
  useDeleteProductMutation,
  useGetProductsQuery,
} from "../productApi";
import type { Product } from "../types/product";
import ProductForm from "./ProductForm";
import ProductTableSkeleton from "./ProductTableSkeleton";
import ProductImportExport from "./ProductImportExport";

export default function ProductList() {
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [editingProduct, setEditingProduct] =
    useState<Product | null>(null);

  const query = {
    pageNumber,
    pageSize,
    search: search.trim() || undefined,
  };

  const { data, isLoading, isFetching, error } =
    useGetProductsQuery(query);

  const [deleteProduct, { isLoading: deleting }] =
    useDeleteProductMutation();

  const handleDelete = async (id: number) => {
    if (!window.confirm("Bạn có chắc muốn xóa sản phẩm này không?")) {
      return;
    }

    try {
      await deleteProduct(id).unwrap();
      alert("Xóa sản phẩm thành công");
    } catch {
      alert("Xóa sản phẩm thất bại");
    }
  };

  if (isLoading) {
    return <ProductTableSkeleton rows={10} />;
  }

  if (error) {
    return <p>Có lỗi khi tải sản phẩm</p>;
  }

  return (
    <section>
      <h2>Danh sách sản phẩm</h2>

      <ProductImportExport query={query} />

      <div>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPageNumber(1);
          }}
          placeholder="Tìm sản phẩm..."
        />
      </div>

      {isFetching && <p>Đang cập nhật dữ liệu...</p>}

      <table>
        <thead>
          <tr>
            <th>Tên</th>
            <th>Mã</th>
            <th>Giá</th>
            <th>Tồn kho</th>
            <th>Category</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>

        <tbody>
          {data?.items.map((product) => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{product.code}</td>
              <td>{product.price}</td>
              <td>{product.stock}</td>
              <td>{product.categoryName}</td>
              <td>{product.isActive ? "Active" : "Inactive"}</td>
              <td>
                <button onClick={() => setEditingProduct(product)}>
                  Sửa
                </button>

                <button
                  disabled={deleting}
                  onClick={() => handleDelete(product.id)}
                >
                  Xóa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <button
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber(pageNumber - 1)}
        >
          Trước
        </button>

        <span>
          Trang {data?.pageNumber} / {data?.totalPages}
        </span>

        <button
          disabled={!data || pageNumber >= data.totalPages}
          onClick={() => setPageNumber(pageNumber + 1)}
        >
          Sau
        </button>
      </div>

      <hr />

      <ProductForm
        product={editingProduct}
        onSuccess={() => setEditingProduct(null)}
      />
    </section>
  );
}
```

---

# 13. Product import/export

## 13.1 Tạo helper download file

```ts
// src/shared/api/downloadFile.ts
export function downloadBlobFile(
  blob: Blob,
  fileName: string
) {
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
}
```

## 13.2 ProductImportExport component

```tsx
// src/features/products/components/ProductImportExport.tsx
import { useState } from "react";
import {
  useImportProductsMutation,
  useLazyExportProductsQuery,
} from "../productApi";
import type { ProductQuery } from "../types/product";
import { downloadBlobFile } from "../../../shared/api/downloadFile";

type ProductImportExportProps = {
  query: ProductQuery;
};

export default function ProductImportExport({
  query,
}: ProductImportExportProps) {
  const [file, setFile] = useState<File | null>(null);

  const [importProducts, { isLoading: importing }] =
    useImportProductsMutation();

  const [exportProducts, { isFetching: exporting }] =
    useLazyExportProductsQuery();

  const handleImport = async () => {
    if (!file) {
      alert("Vui lòng chọn file");
      return;
    }

    try {
      const result = await importProducts(file).unwrap();

      alert(
        `Import xong. Thành công: ${result.successRows}, lỗi: ${result.failedRows}`
      );

      if (result.errors.length > 0) {
        console.table(result.errors);
      }
    } catch {
      alert("Import thất bại");
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportProducts(query).unwrap();

      downloadBlobFile(
        blob,
        `products-${new Date().getTime()}.xlsx`
      );
    } catch {
      alert("Export thất bại");
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => {
          const selectedFile = e.target.files?.[0] ?? null;
          setFile(selectedFile);
        }}
      />

      <button disabled={importing} onClick={handleImport}>
        {importing ? "Đang import..." : "Import"}
      </button>

      <button disabled={exporting} onClick={handleExport}>
        {exporting ? "Đang export..." : "Export"}
      </button>
    </div>
  );
}
```

## 13.3 Backend endpoint cho product

```txt
GET    /api/products
GET    /api/products/{id}
POST   /api/products
PUT    /api/products/{id}
DELETE /api/products/{id}
POST   /api/products/import
GET    /api/products/export
```

Import:

```txt
POST /api/products/import
Content-Type: multipart/form-data
field: file
```

Export:

```txt
GET /api/products/export?pageNumber=1&pageSize=10&search=iphone
Response: file Excel/CSV
```

## 13.4 ProductPage

```tsx
// src/features/products/pages/ProductPage.tsx
import ProductList from "../components/ProductList";

export default function ProductPage() {
  return (
    <main>
      <h1>Quản lý sản phẩm</h1>
      <ProductList />
    </main>
  );
}
```

---

# 14. Category module CRUD đầy đủ

## 14.1 Category types

```ts
// src/features/categories/types/category.ts
export type Category = {
  id: number;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
};

export type CategoryQuery = {
  pageNumber: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
};

export type PagedResult<T> = {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type CreateCategoryRequest = {
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
};

export type UpdateCategoryRequest = {
  id: number;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
};

export type ImportCategoryResult = {
  totalRows: number;
  successRows: number;
  failedRows: number;
  errors: {
    rowNumber: number;
    message: string;
  }[];
};
```

## 14.2 Category API

```ts
// src/features/categories/categoryApi.ts
import { baseApi } from "../../shared/api/baseApi";
import type {
  Category,
  CategoryQuery,
  PagedResult,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ImportCategoryResult,
} from "./types/category";

export const categoryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCategories: builder.query<PagedResult<Category>, CategoryQuery>({
      query: (params) => ({
        url: "/categories",
        method: "GET",
        params,
      }),

      providesTags: ["Category"],
    }),

    getCategoryById: builder.query<Category, number>({
      query: (id) => ({
        url: `/categories/${id}`,
        method: "GET",
      }),

      providesTags: (_result, _error, id) => [
        { type: "Category", id },
      ],
    }),

    createCategory: builder.mutation<Category, CreateCategoryRequest>({
      query: (body) => ({
        url: "/categories",
        method: "POST",
        body,
      }),

      invalidatesTags: ["Category"],
    }),

    updateCategory: builder.mutation<Category, UpdateCategoryRequest>({
      query: ({ id, ...body }) => ({
        url: `/categories/${id}`,
        method: "PUT",
        body,
      }),

      invalidatesTags: (_result, _error, arg) => [
        "Category",
        { type: "Category", id: arg.id },
      ],
    }),

    deleteCategory: builder.mutation<void, number>({
      query: (id) => ({
        url: `/categories/${id}`,
        method: "DELETE",
      }),

      invalidatesTags: ["Category"],
    }),

    importCategories: builder.mutation<ImportCategoryResult, File>({
      query: (file) => {
        const formData = new FormData();
        formData.append("file", file);

        return {
          url: "/categories/import",
          method: "POST",
          body: formData,
        };
      },

      invalidatesTags: ["Category"],
    }),

    exportCategories: builder.query<Blob, CategoryQuery>({
      query: (params) => ({
        url: "/categories/export",
        method: "GET",
        params,
        responseHandler: (response) => response.blob(),
      }),
    }),
  }),
});

export const {
  useGetCategoriesQuery,
  useGetCategoryByIdQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useImportCategoriesMutation,
  useLazyExportCategoriesQuery,
} = categoryApi;
```

## 14.3 CategoryForm

```tsx
// src/features/categories/components/CategoryForm.tsx
import { useState } from "react";
import type {
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "../types/category";
import {
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
} from "../categoryApi";

type CategoryFormProps = {
  category?: Category | null;
  onSuccess?: () => void;
};

export default function CategoryForm({
  category,
  onSuccess,
}: CategoryFormProps) {
  const isEdit = Boolean(category);

  const [createCategory, { isLoading: creating }] =
    useCreateCategoryMutation();

  const [updateCategory, { isLoading: updating }] =
    useUpdateCategoryMutation();

  const [form, setForm] = useState({
    name: category?.name ?? "",
    code: category?.code ?? "",
    description: category?.description ?? "",
    isActive: category?.isActive ?? true,
  });

  const loading = creating || updating;

  const handleSubmit = async () => {
    try {
      if (isEdit && category) {
        const request: UpdateCategoryRequest = {
          id: category.id,
          ...form,
        };

        await updateCategory(request).unwrap();
        alert("Cập nhật category thành công");
      } else {
        const request: CreateCategoryRequest = {
          ...form,
        };

        await createCategory(request).unwrap();
        alert("Tạo category thành công");
      }

      onSuccess?.();
    } catch {
      alert("Lưu category thất bại");
    }
  };

  return (
    <section>
      <h2>{isEdit ? "Cập nhật category" : "Thêm category"}</h2>

      <input
        value={form.name}
        onChange={(e) =>
          setForm({
            ...form,
            name: e.target.value,
          })
        }
        placeholder="Tên category"
      />

      <input
        value={form.code}
        onChange={(e) =>
          setForm({
            ...form,
            code: e.target.value,
          })
        }
        placeholder="Mã category"
      />

      <textarea
        value={form.description}
        onChange={(e) =>
          setForm({
            ...form,
            description: e.target.value,
          })
        }
        placeholder="Mô tả"
      />

      <label>
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) =>
            setForm({
              ...form,
              isActive: e.target.checked,
            })
          }
        />
        Đang hoạt động
      </label>

      <button disabled={loading} onClick={handleSubmit}>
        {loading ? "Đang lưu..." : "Lưu"}
      </button>
    </section>
  );
}
```

## 14.4 CategoryList

```tsx
// src/features/categories/components/CategoryList.tsx
import { useState } from "react";
import {
  useDeleteCategoryMutation,
  useGetCategoriesQuery,
} from "../categoryApi";
import type { Category } from "../types/category";
import CategoryForm from "./CategoryForm";
import CategoryImportExport from "./CategoryImportExport";
import TableSkeleton from "../../../shared/components/TableSkeleton";

export default function CategoryList() {
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [editingCategory, setEditingCategory] =
    useState<Category | null>(null);

  const query = {
    pageNumber,
    pageSize,
    search: search.trim() || undefined,
  };

  const { data, isLoading, isFetching, error } =
    useGetCategoriesQuery(query);

  const [deleteCategory, { isLoading: deleting }] =
    useDeleteCategoryMutation();

  const handleDelete = async (id: number) => {
    if (!window.confirm("Bạn có chắc muốn xóa category này không?")) {
      return;
    }

    try {
      await deleteCategory(id).unwrap();
      alert("Xóa category thành công");
    } catch {
      alert("Xóa category thất bại");
    }
  };

  if (isLoading) {
    return <TableSkeleton rows={10} columns={5} />;
  }

  if (error) {
    return <p>Có lỗi khi tải category</p>;
  }

  return (
    <section>
      <h2>Danh sách category</h2>

      <CategoryImportExport query={query} />

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPageNumber(1);
        }}
        placeholder="Tìm category..."
      />

      {isFetching && <p>Đang cập nhật dữ liệu...</p>}

      <table>
        <thead>
          <tr>
            <th>Tên</th>
            <th>Mã</th>
            <th>Mô tả</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>

        <tbody>
          {data?.items.map((category) => (
            <tr key={category.id}>
              <td>{category.name}</td>
              <td>{category.code}</td>
              <td>{category.description}</td>
              <td>{category.isActive ? "Active" : "Inactive"}</td>
              <td>
                <button onClick={() => setEditingCategory(category)}>
                  Sửa
                </button>

                <button
                  disabled={deleting}
                  onClick={() => handleDelete(category.id)}
                >
                  Xóa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <button
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber(pageNumber - 1)}
        >
          Trước
        </button>

        <span>
          Trang {data?.pageNumber} / {data?.totalPages}
        </span>

        <button
          disabled={!data || pageNumber >= data.totalPages}
          onClick={() => setPageNumber(pageNumber + 1)}
        >
          Sau
        </button>
      </div>

      <hr />

      <CategoryForm
        category={editingCategory}
        onSuccess={() => setEditingCategory(null)}
      />
    </section>
  );
}
```

---

# 15. Category import/export

```tsx
// src/features/categories/components/CategoryImportExport.tsx
import { useState } from "react";
import {
  useImportCategoriesMutation,
  useLazyExportCategoriesQuery,
} from "../categoryApi";
import type { CategoryQuery } from "../types/category";
import { downloadBlobFile } from "../../../shared/api/downloadFile";

type CategoryImportExportProps = {
  query: CategoryQuery;
};

export default function CategoryImportExport({
  query,
}: CategoryImportExportProps) {
  const [file, setFile] = useState<File | null>(null);

  const [importCategories, { isLoading: importing }] =
    useImportCategoriesMutation();

  const [exportCategories, { isFetching: exporting }] =
    useLazyExportCategoriesQuery();

  const handleImport = async () => {
    if (!file) {
      alert("Vui lòng chọn file");
      return;
    }

    try {
      const result = await importCategories(file).unwrap();

      alert(
        `Import xong. Thành công: ${result.successRows}, lỗi: ${result.failedRows}`
      );

      if (result.errors.length > 0) {
        console.table(result.errors);
      }
    } catch {
      alert("Import category thất bại");
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportCategories(query).unwrap();

      downloadBlobFile(
        blob,
        `categories-${new Date().getTime()}.xlsx`
      );
    } catch {
      alert("Export category thất bại");
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => {
          const selectedFile = e.target.files?.[0] ?? null;
          setFile(selectedFile);
        }}
      />

      <button disabled={importing} onClick={handleImport}>
        {importing ? "Đang import..." : "Import"}
      </button>

      <button disabled={exporting} onClick={handleExport}>
        {exporting ? "Đang export..." : "Export"}
      </button>
    </div>
  );
}
```

Category page:

```tsx
// src/features/categories/pages/CategoryPage.tsx
import CategoryList from "../components/CategoryList";

export default function CategoryPage() {
  return (
    <main>
      <h1>Quản lý category</h1>
      <CategoryList />
    </main>
  );
}
```

Backend endpoint category:

```txt
GET    /api/categories
GET    /api/categories/{id}
POST   /api/categories
PUT    /api/categories/{id}
DELETE /api/categories/{id}
POST   /api/categories/import
GET    /api/categories/export
```

---

# 16. Account module CRUD

## 16.1 Account types

```ts
// src/features/accounts/types/account.ts
export type Account = {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
};

export type AccountQuery = {
  pageNumber: number;
  pageSize: number;
  search?: string;
  role?: string;
  isActive?: boolean;
};

export type PagedResult<T> = {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type CreateAccountRequest = {
  username: string;
  password: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
};

export type UpdateAccountRequest = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
};

export type ChangePasswordRequest = {
  id: number;
  newPassword: string;
};
```

## 16.2 Account API

```ts
// src/features/accounts/accountApi.ts
import { baseApi } from "../../shared/api/baseApi";
import type {
  Account,
  AccountQuery,
  PagedResult,
  CreateAccountRequest,
  UpdateAccountRequest,
  ChangePasswordRequest,
} from "./types/account";

export const accountApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAccounts: builder.query<PagedResult<Account>, AccountQuery>({
      query: (params) => ({
        url: "/accounts",
        method: "GET",
        params,
      }),

      providesTags: ["Account"],
    }),

    getAccountById: builder.query<Account, number>({
      query: (id) => ({
        url: `/accounts/${id}`,
        method: "GET",
      }),

      providesTags: (_result, _error, id) => [
        { type: "Account", id },
      ],
    }),

    createAccount: builder.mutation<Account, CreateAccountRequest>({
      query: (body) => ({
        url: "/accounts",
        method: "POST",
        body,
      }),

      invalidatesTags: ["Account"],
    }),

    updateAccount: builder.mutation<Account, UpdateAccountRequest>({
      query: ({ id, ...body }) => ({
        url: `/accounts/${id}`,
        method: "PUT",
        body,
      }),

      invalidatesTags: (_result, _error, arg) => [
        "Account",
        { type: "Account", id: arg.id },
      ],
    }),

    deleteAccount: builder.mutation<void, number>({
      query: (id) => ({
        url: `/accounts/${id}`,
        method: "DELETE",
      }),

      invalidatesTags: ["Account"],
    }),

    changePassword: builder.mutation<void, ChangePasswordRequest>({
      query: ({ id, newPassword }) => ({
        url: `/accounts/${id}/change-password`,
        method: "POST",
        body: {
          newPassword,
        },
      }),
    }),

    lockAccount: builder.mutation<void, number>({
      query: (id) => ({
        url: `/accounts/${id}/lock`,
        method: "POST",
      }),

      invalidatesTags: ["Account"],
    }),

    unlockAccount: builder.mutation<void, number>({
      query: (id) => ({
        url: `/accounts/${id}/unlock`,
        method: "POST",
      }),

      invalidatesTags: ["Account"],
    }),
  }),
});

export const {
  useGetAccountsQuery,
  useGetAccountByIdQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useChangePasswordMutation,
  useLockAccountMutation,
  useUnlockAccountMutation,
} = accountApi;
```

## 16.3 AccountList ví dụ

```tsx
// src/features/accounts/components/AccountList.tsx
import { useState } from "react";
import {
  useGetAccountsQuery,
  useLockAccountMutation,
  useUnlockAccountMutation,
  useDeleteAccountMutation,
} from "../accountApi";
import TableSkeleton from "../../../shared/components/TableSkeleton";

export default function AccountList() {
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize] = useState(10);
  const [search, setSearch] = useState("");

  const { data, isLoading, isFetching, error } =
    useGetAccountsQuery({
      pageNumber,
      pageSize,
      search: search.trim() || undefined,
    });

  const [lockAccount] = useLockAccountMutation();
  const [unlockAccount] = useUnlockAccountMutation();
  const [deleteAccount] = useDeleteAccountMutation();

  const handleLockToggle = async (id: number, isActive: boolean) => {
    try {
      if (isActive) {
        await lockAccount(id).unwrap();
      } else {
        await unlockAccount(id).unwrap();
      }
    } catch {
      alert("Cập nhật trạng thái account thất bại");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Bạn có chắc muốn xóa account này không?")) {
      return;
    }

    try {
      await deleteAccount(id).unwrap();
    } catch {
      alert("Xóa account thất bại");
    }
  };

  if (isLoading) {
    return <TableSkeleton rows={10} columns={6} />;
  }

  if (error) {
    return <p>Không tải được danh sách account</p>;
  }

  return (
    <section>
      <h2>Danh sách account</h2>

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPageNumber(1);
        }}
        placeholder="Tìm account..."
      />

      {isFetching && <p>Đang cập nhật...</p>}

      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Họ tên</th>
            <th>Email</th>
            <th>Role</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>

        <tbody>
          {data?.items.map((account) => (
            <tr key={account.id}>
              <td>{account.username}</td>
              <td>{account.fullName}</td>
              <td>{account.email}</td>
              <td>{account.role}</td>
              <td>{account.isActive ? "Active" : "Locked"}</td>
              <td>
                <button
                  onClick={() =>
                    handleLockToggle(account.id, account.isActive)
                  }
                >
                  {account.isActive ? "Khóa" : "Mở khóa"}
                </button>

                <button onClick={() => handleDelete(account.id)}>
                  Xóa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <button
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber(pageNumber - 1)}
        >
          Trước
        </button>

        <span>
          Trang {data?.pageNumber} / {data?.totalPages}
        </span>

        <button
          disabled={!data || pageNumber >= data.totalPages}
          onClick={() => setPageNumber(pageNumber + 1)}
        >
          Sau
        </button>
      </div>
    </section>
  );
}
```

Account page:

```tsx
// src/features/accounts/pages/AccountPage.tsx
import AccountList from "../components/AccountList";

export default function AccountPage() {
  return (
    <main>
      <h1>Quản lý account</h1>
      <AccountList />
    </main>
  );
}
```

Backend endpoint account:

```txt
GET    /api/accounts
GET    /api/accounts/{id}
POST   /api/accounts
PUT    /api/accounts/{id}
DELETE /api/accounts/{id}
POST   /api/accounts/{id}/lock
POST   /api/accounts/{id}/unlock
POST   /api/accounts/{id}/change-password
```

---

# 17. Skeleton React là gì?

Skeleton UI là giao diện giả lập bố cục nội dung trong lúc dữ liệu đang tải.

Thay vì hiển thị:

```txt
Loading...
```

ta hiển thị khung giả giống nội dung thật:

```txt
| ████████ | ████████ | ████████ |
| ████████ | ████████ | ████████ |
| ████████ | ████████ | ████████ |
```

Mục đích:

```txt
người dùng biết layout đang được chuẩn bị
giao diện đỡ trống
cảm giác app nhanh hơn
trải nghiệm tốt hơn spinner
```

Nên dùng Skeleton khi:

```txt
tải danh sách product lần đầu
tải danh sách account lần đầu
tải dashboard card
tải form detail
```

Không cần dùng Skeleton khi:

```txt
bấm xóa một dòng
bấm submit form
request rất nhanh
```

---

# 18. Dùng Skeleton với RTK Query

## 18.1 SkeletonBox

```tsx
// src/shared/components/SkeletonBox.tsx
import "./SkeletonBox.css";

type SkeletonBoxProps = {
  width?: string;
  height?: string;
  borderRadius?: string;
};

export default function SkeletonBox({
  width = "100%",
  height = "16px",
  borderRadius = "4px",
}: SkeletonBoxProps) {
  return (
    <div
      className="skeleton-box"
      style={{
        width,
        height,
        borderRadius,
      }}
    />
  );
}
```

CSS:

```css
/* src/shared/components/SkeletonBox.css */
.skeleton-box {
  background: linear-gradient(
    90deg,
    #eeeeee 25%,
    #dddddd 37%,
    #eeeeee 63%
  );
  background-size: 400% 100%;
  animation: skeleton-loading 1.4s ease infinite;
}

@keyframes skeleton-loading {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0 50%;
  }
}
```

## 18.2 TableSkeleton dùng chung

```tsx
// src/shared/components/TableSkeleton.tsx
import SkeletonBox from "./SkeletonBox";

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
};

export default function TableSkeleton({
  rows = 10,
  columns = 5,
}: TableSkeletonProps) {
  return (
    <div>
      <SkeletonBox width="240px" height="28px" />

      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <SkeletonBox width="320px" height="36px" />
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: 12,
            }}
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <SkeletonBox key={colIndex} height="22px" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## 18.3 ProductTableSkeleton riêng

```tsx
// src/features/products/components/ProductTableSkeleton.tsx
import TableSkeleton from "../../../shared/components/TableSkeleton";

type ProductTableSkeletonProps = {
  rows?: number;
};

export default function ProductTableSkeleton({
  rows = 10,
}: ProductTableSkeletonProps) {
  return <TableSkeleton rows={rows} columns={7} />;
}
```

## 18.4 Dùng Skeleton đúng cách

```tsx
const { data, isLoading, isFetching, error } =
  useGetProductsQuery(query);

if (isLoading) {
  return <ProductTableSkeleton rows={10} />;
}

if (error) {
  return <p>Có lỗi khi tải dữ liệu</p>;
}

return (
  <>
    {isFetching && <p>Đang cập nhật dữ liệu...</p>}
    <ProductTable data={data} />
  </>
);
```

Tư duy:

```txt
isLoading
→ chưa có data lần đầu
→ hiện skeleton

isFetching
→ đang refetch nhưng có thể đã có data cũ
→ giữ UI cũ, chỉ hiện text nhỏ "Đang cập nhật..."
```

---

# 19. providesTags và invalidatesTags

## 19.1 providesTags

Query nào lấy data thì khai báo nó cung cấp tag gì.

```ts
getProducts: builder.query<PagedResult<Product>, ProductQuery>({
  query: (params) => ({
    url: "/products",
    params,
  }),

  providesTags: ["Product"],
})
```

Nghĩa là:

```txt
Danh sách product này thuộc cache tag Product
```

## 19.2 invalidatesTags

Mutation nào làm thay đổi data thì khai báo nó làm cũ tag gì.

```ts
deleteProduct: builder.mutation<void, number>({
  query: (id) => ({
    url: `/products/${id}`,
    method: "DELETE",
  }),

  invalidatesTags: ["Product"],
})
```

Nghĩa là:

```txt
Sau khi xóa product thành công
cache Product bị cũ
RTK Query tự refetch các query đang dùng Product tag
```

## 19.3 Ví dụ thực tế

```txt
ProductList đang gọi getProducts
  ↓
getProducts providesTags ["Product"]
  ↓
Người dùng bấm xóa
  ↓
deleteProduct invalidatesTags ["Product"]
  ↓
RTK Query tự gọi lại getProducts
  ↓
Danh sách cập nhật
```

Anh không cần viết:

```ts
dispatch(fetchProducts());
```

sau khi xóa nữa.

---

# 20. Thunk còn dùng khi nào?

RTK Query rất hợp cho CRUD/API data.

Nhưng vẫn có thể dùng thunk khi logic async không chỉ là CRUD API.

Ví dụ:

```txt
workflow nhiều bước
upload file có progress phức tạp
gọi nhiều API liên tiếp và xử lý nghiệp vụ
websocket
background job
logic không cần cache
```

Ví dụ import file lớn:

```txt
Upload file
  ↓
Nhận jobId
  ↓
Polling trạng thái
  ↓
Tải file lỗi
  ↓
Hiển thị log import
```

Trường hợp này có thể kết hợp:

```txt
RTK Query cho API
thunk/custom hook cho workflow đặc biệt
```

---

# 21. Repository, Manager, Service có cần không?

## 21.1 Repository

Repository trong frontend thường là file gom các hàm gọi API.

Ví dụ nếu không dùng RTK Query:

```ts
productRepository.getProducts()
productRepository.createProduct()
```

Nhưng khi dùng RTK Query, `productApi.ts` đã đóng vai trò API layer.

Vì vậy CRUD đơn giản:

```txt
Không cần repository riêng
```

## 21.2 Service/Manager

Service hoặc Manager chứa logic nghiệp vụ phía frontend.

Ví dụ:

```ts
// src/features/products/productService.ts
export const productService = {
  canDelete: (product: { stock: number }) => {
    return product.stock === 0;
  },

  normalizeSearch: (keyword: string) => {
    return keyword.trim().toLowerCase();
  },
};
```

Chỉ nên tạo service khi logic bắt đầu lặp lại hoặc phức tạp.

Không nên lạm dụng:

```txt
productRepository
productManager
productService
productHelper
productUtil
```

ngay từ đầu nếu CRUD còn đơn giản.

---

# 22. Checklist học

## 22.1 Cần hiểu store

```txt
store.ts có authReducer vì auth là client state
store.ts có baseApi.reducer vì RTK Query cần nơi lưu cache
product/category/account không cần reducer riêng nếu dùng RTK Query
```

## 22.2 Cần hiểu product

```txt
productApi.ts
→ khai báo endpoint product

useGetProductsQuery
→ lấy danh sách product

useCreateProductMutation
→ tạo product

useUpdateProductMutation
→ sửa product

useDeleteProductMutation
→ xóa product

useImportProductsMutation
→ import file product

useLazyExportProductsQuery
→ export file product
```

## 22.3 Cần hiểu category

```txt
categoryApi.ts
→ khai báo endpoint category

useGetCategoriesQuery
→ lấy danh sách category

useCreateCategoryMutation
→ tạo category

useUpdateCategoryMutation
→ sửa category

useDeleteCategoryMutation
→ xóa category

useImportCategoriesMutation
→ import category

useLazyExportCategoriesQuery
→ export category
```

## 22.4 Cần hiểu account

```txt
accountApi.ts
→ khai báo endpoint account

useGetAccountsQuery
→ lấy danh sách account

useCreateAccountMutation
→ tạo account

useUpdateAccountMutation
→ sửa account

useDeleteAccountMutation
→ xóa account

useLockAccountMutation
→ khóa account

useUnlockAccountMutation
→ mở khóa account
```

## 22.5 Bài tập nên làm theo thứ tự

```txt
1. Tạo project Vite React TypeScript
2. Cài @reduxjs/toolkit react-redux react-router-dom
3. Tạo store.ts
4. Tạo hooks.ts
5. Tạo baseApi.ts
6. Tạo authSlice.ts
7. Tạo authApi.ts
8. Tạo LoginPage
9. Tạo ProtectedRoute
10. Tạo productApi.ts
11. Tạo ProductList
12. Tạo ProductForm
13. Tạo ProductImportExport
14. Tạo categoryApi.ts
15. Tạo CategoryList
16. Tạo CategoryForm
17. Tạo CategoryImportExport
18. Tạo accountApi.ts
19. Tạo AccountList
20. Thêm Skeleton
```

---

# 23. Tổng kết

Với dự án thực tế:

```txt
login
product CRUD
category CRUD
account CRUD
search
pagination
import/export
phải login mới được vào
```

Nên dùng:

```txt
Redux Toolkit + RTK Query
```

Cấu trúc đúng:

```txt
authSlice
→ token, user, isAuthenticated

baseApi
→ config API chung, gắn token, khai báo tagTypes

productApi
→ CRUD/import/export product

categoryApi
→ CRUD/import/export category

accountApi
→ CRUD account

store.ts
→ chỉ cần authReducer + baseApi.reducer

component
→ gọi hook RTK Query và render UI
```

Câu nhớ nhanh:

```txt
Product/category/account là API data
→ để trong RTK Query

Auth token/user là frontend state
→ để trong authSlice

CRUD nhiều
→ dùng RTK Query

Workflow đặc biệt
→ cân nhắc thunk/custom hook

Loading trang lần đầu
→ dùng Skeleton

Sau create/update/delete
→ dùng invalidatesTags để tự refetch
```

---

# Phụ lục: Endpoint backend nên có

## Auth

```txt
POST /api/auth/login
```

## Product

```txt
GET    /api/products
GET    /api/products/{id}
POST   /api/products
PUT    /api/products/{id}
DELETE /api/products/{id}
POST   /api/products/import
GET    /api/products/export
```

## Category

```txt
GET    /api/categories
GET    /api/categories/{id}
POST   /api/categories
PUT    /api/categories/{id}
DELETE /api/categories/{id}
POST   /api/categories/import
GET    /api/categories/export
```

## Account

```txt
GET    /api/accounts
GET    /api/accounts/{id}
POST   /api/accounts
PUT    /api/accounts/{id}
DELETE /api/accounts/{id}
POST   /api/accounts/{id}/lock
POST   /api/accounts/{id}/unlock
POST   /api/accounts/{id}/change-password
```
