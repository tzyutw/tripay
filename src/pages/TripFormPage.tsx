import { useParams } from 'react-router-dom';

export default function TripFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-ink">
        {isEdit ? '編輯行程' : '新增行程'}
      </h1>
      <p className="mt-2 text-muted text-sm">— S-02 行程表單（建置中）—</p>
    </div>
  );
}
