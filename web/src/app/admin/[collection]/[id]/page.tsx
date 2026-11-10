import { Suspense } from "react";
import { Editor } from "../../editor";
import { Loading } from "../../ui";

async function Body({ params }: { params: PageProps<"/admin/[collection]/[id]">["params"] }) {
  const { collection, id } = await params;
  return <Editor collection={collection} id={decodeURIComponent(id)} />;
}

export default function EditDoc(props: PageProps<"/admin/[collection]/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Body params={props.params} />
    </Suspense>
  );
}
