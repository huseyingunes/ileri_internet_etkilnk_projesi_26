import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useState } from 'react';
import { ApiError } from '../api/client';
import { answerReasonPrompt, listReasonPrompts, type ReasonPrompt } from '../api/feedback';
import { Link } from '../router';
import { Button, Card, PageTitle, StatusMessage, TextArea } from '../ui';

function PromptCard({ prompt }: { prompt: ReasonPrompt }) {
  const client = useQueryClient();
  const [error, setError] = useState<string>();
  const answer = useMutation({
    mutationFn: (text: string) => answerReasonPrompt(prompt.id, text),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['reason-prompts'] });
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Yanıt kaydedilemedi.');
    },
  });
  return (
    <Card>
      <form
        className="flex flex-col gap-md"
        onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
          event.preventDefault();
          const text = new FormData(event.currentTarget).get('answer');
          answer.mutate(typeof text === 'string' ? text : '');
        }}
      >
        <h2 className="text-lg font-semibold">
          <Link href={`/etkinlikler/${prompt.event.id}`} className="underline underline-offset-4">
            {prompt.event.title}
          </Link>
        </h2>
        <TextArea
          label={prompt.question}
          name="answer"
          required
          maxLength={2000}
          error={error}
          hint="Yanıtınız katılımı artırmak için toplu olarak değerlendirilir."
        />
        <div>
          <Button type="submit" disabled={answer.isPending}>
            Yanıtı gönder
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Student: the open "why" questions after winning events they voted for. */
export function ReasonPromptsPage() {
  const prompts = useQuery({ queryKey: ['reason-prompts'], queryFn: listReasonPrompts });
  return (
    <>
      <PageTitle description="Oy verdiğiniz ve kazanan etkinliklerden sonra tek bir soru sorulur. Yanıt vermek isteğe bağlıdır.">
        Sorularım
      </PageTitle>
      {prompts.status === 'error' && (
        <StatusMessage tone="error">Sorular yüklenemedi.</StatusMessage>
      )}
      {prompts.data?.items.length === 0 && <StatusMessage>Bekleyen sorunuz yok.</StatusMessage>}
      <ul className="grid gap-md">
        {prompts.data?.items.map((prompt) => (
          <li key={prompt.id}>
            <PromptCard prompt={prompt} />
          </li>
        ))}
      </ul>
    </>
  );
}
