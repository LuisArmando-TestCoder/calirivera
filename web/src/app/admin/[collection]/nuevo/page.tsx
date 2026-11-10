import { Suspense } from "react";
import { Editor } from "../../editor";
import { Loading } from "../../ui";

async function Body({ params }: { params: PageProps<"/admin/[collection]/nuevo">["params"] }) {
  const { collection } = await params;
  return <Editor collection={collection} id={null} />;
}

export default function NewDoc(props: PageProps<"/admin/[collection]/nuevo">) {
  return (
    <Suspense fallback={<Loading />}>
      <Body params={props.params} />
    </Suspense>
  );
}
